// Owner-Operator Recruiting -- FMCSA lead sourcing (module 2, FMCSA part)
//
// Pulls carrier data from FMCSA's QCMobile API for a given list of USDOT
// numbers. Per DOT number: checks excluded_entities (never becomes a
// target -- no snapshot, no lead, nothing written), writes an append-only
// carrier_snapshots row, upserts a leads row, then calls the fmcsa-score-lead
// Edge Function (2026-09-28: split out purely to keep each file small
// enough to paste reliably -- no behavior change) to derive vetting flags
// and a fit score.
//
// FMCSA_WEB_KEY is a Supabase Edge Function secret -- fetched here via
// Deno.env, never sent to or read by the browser.
//
// Confirmed NOT available anywhere in this API (RECRUITING.md section 9a):
// an authority-granted/DOT-registration date, and any contact phone/email.
// authority_granted_date stays null on every snapshot; segment (new_mc vs.
// small_fleet) is assigned on power units alone (see segmentFor). Phone/
// email stay null -- this function only sources, vets, and scores; it
// never attempts outreach.
//
// Fair screening (RECRUITING.md section 8): every signal used is a
// business/safety factor FMCSA itself publishes -- nothing about the
// carrier's owners/drivers as people is collected or scored.
//
// Manual-trigger-by-DOT-list only -- run via this function's Test button
// with body {"dotNumbers": ["<dot1>", "<dot2>", ...]}.

import { createClient } from "npm:@supabase/supabase-js@2";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toYesNo(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (["Y", "YES", "TRUE"].includes(s)) return true;
  if (["N", "NO", "FALSE"].includes(s)) return false;
  return null;
}
function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}
function toDateStr(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const iso = new Date(s.replace(" ", "T"));
  if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return y + "-" + mo.padStart(2, "0") + "-" + d.padStart(2, "0");
  }
  return null;
}

interface CarrierProfile {
  dotNumber: number;
  mcNumber: string | null;
  legalName: string | null;
  dbaName: string | null;
  phyCity: string | null;
  phyState: string | null;
  allowedToOperate: boolean | null;
  oosDate: string | null;
  commonAuthorityStatus: string | null;
  contractAuthorityStatus: string | null;
  brokerAuthorityStatus: string | null;
  authorityGrantedDate: string | null;
  authorityDateSource: string | null;
  powerUnits: number | null;
  drivers: number | null;
  safetyRating: string | null;
  safetyRatingDate: string | null;
  driverInspections: number | null;
  driverOosInspections: number | null;
  driverOosRate: number | null;
  driverOosRateNatl: number | null;
  vehicleInspections: number | null;
  vehicleOosInspections: number | null;
  vehicleOosRate: number | null;
  vehicleOosRateNatl: number | null;
  crashTotal: number | null;
  fatalCrash: number | null;
  injuryCrash: number | null;
  towawayCrash: number | null;
  bipdOnFile: number | null;
  bipdRequired: number | null;
  cargoOnFile: number | null;
  mcs150Outdated: boolean | null;
}

function carrierProfileFromQcmobile(carrier: Record<string, unknown>, mcNumber: string | null): CarrierProfile {
  const rating = toText(carrier.safetyRating);
  return {
    dotNumber: toInt(carrier.dotNumber)!,
    mcNumber,
    legalName: toText(carrier.legalName),
    dbaName: toText(carrier.dbaName),
    phyCity: toText(carrier.phyCity),
    phyState: toText(carrier.phyState),
    allowedToOperate: toYesNo(carrier.allowedToOperate),
    oosDate: toDateStr(carrier.oosDate),
    commonAuthorityStatus: toText(carrier.commonAuthorityStatus),
    contractAuthorityStatus: toText(carrier.contractAuthorityStatus),
    brokerAuthorityStatus: toText(carrier.brokerAuthorityStatus),
    authorityGrantedDate: null,
    authorityDateSource: null,
    powerUnits: toInt(carrier.totalPowerUnits),
    drivers: toInt(carrier.totalDrivers),
    safetyRating: rating ? rating.toUpperCase() : null,
    safetyRatingDate: toDateStr(carrier.safetyRatingDate),
    driverInspections: toInt(carrier.driverInsp),
    driverOosInspections: toInt(carrier.driverOosInsp),
    driverOosRate: toFloat(carrier.driverOosRate),
    driverOosRateNatl: toFloat(carrier.driverOosRateNationalAverage),
    vehicleInspections: toInt(carrier.vehicleInsp),
    vehicleOosInspections: toInt(carrier.vehicleOosInsp),
    vehicleOosRate: toFloat(carrier.vehicleOosRate),
    vehicleOosRateNatl: toFloat(carrier.vehicleOosRateNationalAverage),
    crashTotal: toInt(carrier.crashTotal),
    fatalCrash: toInt(carrier.fatalCrash),
    injuryCrash: toInt(carrier.injCrash),
    towawayCrash: toInt(carrier.towawayCrash),
    bipdOnFile: toInt(carrier.bipdInsuranceOnFile),
    bipdRequired: toInt(carrier.bipdRequiredAmount),
    cargoOnFile: toInt(carrier.cargoInsuranceOnFile),
    mcs150Outdated: toYesNo(carrier.mcs150Outdated),
  };
}

// Power units alone (1-3 -> new_mc, 4-10 -> small_fleet) -- authority age
// would normally help decide this too, but FMCSA doesn't expose that date.
function segmentFor(totalPowerUnits: number | null): "new_mc" | "small_fleet" | null {
  if (totalPowerUnits === null) return null;
  if (totalPowerUnits >= 1 && totalPowerUnits <= 3) return "new_mc";
  if (totalPowerUnits >= 4 && totalPowerUnits <= 10) return "small_fleet";
  return null;
}

async function fmcsaGet(path: string, webKey: string) {
  const url = new URL(FMCSA_BASE + path);
  url.searchParams.set("webKey", webKey);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(path + " failed (" + res.status + "): " + text.slice(0, 300));
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const webKey = Deno.env.get("FMCSA_WEB_KEY");
    if (!webKey) throw new Error("FMCSA_WEB_KEY secret not set");

    const { dotNumbers } = await req.json();
    if (!Array.isArray(dotNumbers) || dotNumbers.length === 0) {
      throw new Error('Body must include "dotNumbers": a non-empty array of USDOT numbers');
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const imported: Record<string, unknown>[] = [];
    const skipped: { dotNumber: string; reason: string }[] = [];
    const failed: { dotNumber: string; error: string }[] = [];

    for (const dotNumber of dotNumbers) {
      try {
        const [carrierRes, docketRes] = await Promise.all([
          fmcsaGet("/carriers/" + dotNumber, webKey),
          fmcsaGet("/carriers/" + dotNumber + "/docket-numbers", webKey),
        ]);
        const carrier = carrierRes?.content?.carrier;
        if (!carrier) { skipped.push({ dotNumber, reason: "No carrier record returned" }); continue; }

        const dockets: { docketNumber?: string; prefix?: string }[] = docketRes?.content ?? [];
        const mcDocket = dockets.find((d) => !d.prefix || d.prefix.toUpperCase() === "MC");
        const mcNumber = mcDocket?.docketNumber ? String(mcDocket.docketNumber).replace(/\D/g, "").replace(/^0+(?=\d)/, "") : null;

        const profile = carrierProfileFromQcmobile(carrier, mcNumber);

        // Never becomes a recruiting target -- no snapshot, no lead.
        const { data: exclusionReason, error: exclErr } = await supabase.rpc("check_exclusion", {
          p_dot: profile.dotNumber,
          p_mc: profile.mcNumber,
          p_name: profile.legalName,
        });
        if (exclErr) throw exclErr;
        let excluded = exclusionReason as string | null;
        if (!excluded && profile.dbaName) {
          const { data: dbaReason, error: dbaErr } = await supabase.rpc("check_exclusion", {
            p_dot: profile.dotNumber,
            p_mc: profile.mcNumber,
            p_name: profile.dbaName,
          });
          if (dbaErr) throw dbaErr;
          excluded = dbaReason as string | null;
        }
        if (excluded) { skipped.push({ dotNumber, reason: "Excluded entity: " + excluded }); continue; }

        const segment = segmentFor(profile.powerUnits);
        if (!segment) {
          skipped.push({ dotNumber, reason: "Power units (" + (carrier.totalPowerUnits ?? "none on file") + ") outside 1-10 target range" });
          continue;
        }

        const { data: snapshot, error: snapErr } = await supabase
          .from("carrier_snapshots")
          .insert({
            dot_number: profile.dotNumber,
            mc_number: profile.mcNumber,
            legal_name: profile.legalName,
            dba_name: profile.dbaName,
            phy_city: profile.phyCity,
            phy_state: profile.phyState,
            allowed_to_operate: profile.allowedToOperate,
            oos_date: profile.oosDate,
            common_authority_status: profile.commonAuthorityStatus,
            contract_authority_status: profile.contractAuthorityStatus,
            broker_authority_status: profile.brokerAuthorityStatus,
            authority_granted_date: profile.authorityGrantedDate,
            authority_date_source: profile.authorityDateSource,
            power_units: profile.powerUnits,
            drivers: profile.drivers,
            safety_rating: profile.safetyRating,
            safety_rating_date: profile.safetyRatingDate,
            driver_inspections: profile.driverInspections,
            driver_oos_inspections: profile.driverOosInspections,
            driver_oos_rate: profile.driverOosRate,
            driver_oos_rate_natl: profile.driverOosRateNatl,
            vehicle_inspections: profile.vehicleInspections,
            vehicle_oos_inspections: profile.vehicleOosInspections,
            vehicle_oos_rate: profile.vehicleOosRate,
            vehicle_oos_rate_natl: profile.vehicleOosRateNatl,
            crash_total: profile.crashTotal,
            fatal_crash: profile.fatalCrash,
            injury_crash: profile.injuryCrash,
            towaway_crash: profile.towawayCrash,
            bipd_on_file: profile.bipdOnFile,
            bipd_required: profile.bipdRequired,
            cargo_on_file: profile.cargoOnFile,
            mcs150_outdated: profile.mcs150Outdated,
            raw: { carrier, docketNumbers: docketRes?.content ?? null },
          })
          .select("id")
          .single();
        if (snapErr) throw snapErr;

        const leadRow: Record<string, unknown> = {
          segment,
          source_code: "fmcsa_lookup",
          dot_number: profile.dotNumber,
          mc_number: profile.mcNumber,
          legal_name: profile.legalName,
          dba_name: profile.dbaName,
          city: profile.phyCity,
          state: profile.phyState,
          latest_snapshot_id: snapshot.id,
        };

        const { data: existing } = await supabase.from("leads").select("id").eq("dot_number", profile.dotNumber).maybeSingle();
        let leadId: string;
        if (existing) {
          const { error } = await supabase.from("leads").update(leadRow).eq("id", existing.id);
          if (error) throw error;
          leadId = existing.id;
        } else {
          const { data: inserted, error } = await supabase.from("leads").insert(leadRow).select("id").single();
          if (error) throw error;
          leadId = inserted.id;
        }

        const scoreRes = await fetch(supabaseUrl + "/functions/v1/fmcsa-score-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + serviceKey },
          body: JSON.stringify({ leadId }),
        });
        const scoreJson = await scoreRes.json();
        if (!scoreRes.ok) throw new Error("fmcsa-score-lead failed: " + (scoreJson?.error ?? scoreRes.status));

        imported.push({ dotNumber: String(dotNumber), leadId, segment, ...scoreJson });
      } catch (err) {
        failed.push({ dotNumber, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(JSON.stringify({ imported, skipped, failed }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
