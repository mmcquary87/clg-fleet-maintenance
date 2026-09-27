// Owner-Operator Recruiting — FMCSA lead sourcing (module 2, FMCSA part)
//
// Pulls carrier data from FMCSA's QCMobile API for a given list of USDOT
// numbers and upserts qualifying ones into `leads` (source = 'fmcsa').
// Field names and endpoint shapes below are all confirmed against live
// responses (2026-09-27, DOT 2516954) via the fmcsa-explore probe this
// replaces -- see that probe's git history for the raw responses.
//
// Confirmed NOT available anywhere in this API (checked every _links
// sub-resource on the base carrier response: authority, docket-numbers,
// basics, operation-classification, cargo-carried): an authority-granted
// or DOT-registration date, and any contact phone/email. Both are real
// gaps, not oversights:
//   - authority_date is left null on every FMCSA-sourced lead. Segment
//     is assigned on power_units alone instead (see segmentFor below) --
//     confirming actual authority age is left as a manual step until a
//     module 3 (vetting) flag exists to track it, or a richer data
//     source (FMCSA's separate Licensing & Insurance system, or Aljex)
//     supplies it.
//   - phone/email are left null. FMCSA-sourced leads are structurally
//     incomplete for outreach until enriched from another source --
//     this function only sources and scores them, per its module 2
//     scope; it never attempts outreach itself.
//
// Fair screening (RECRUITING.md section 8): every signal used below --
// authority status, safety rating, out-of-service rates, crash history,
// power units -- is a business/safety factor FMCSA itself publishes.
// Nothing about the carrier's owners/drivers as people is collected or
// scored.
//
// This is manual-trigger-by-DOT-list only (no bulk "search all carriers"
// endpoint exists in QCMobile) -- run via this function's Test button
// with body {"dotNumbers": ["<dot1>", "<dot2>", ...]}, or wire up a
// scheduled call with a maintained list later.

import { createClient } from "npm:@supabase/supabase-js@2";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function fmcsaGet(path: string, webKey: string) {
  const url = new URL(`${FMCSA_BASE}${path}`);
  url.searchParams.set("webKey", webKey);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// Power units alone (1-3 -> new_mc, 4-10 -> small_fleet) -- authority
// age would normally also decide new_mc vs. small_fleet per
// RECRUITING.md section 3, but FMCSA doesn't expose that date (see file
// header). Outside 1-10 entirely, or no power units on file: not a fit
// for either offer this sourcing pass targets, so the caller skips it
// rather than importing with a guessed segment.
function segmentFor(totalPowerUnits: number): "new_mc" | "small_fleet" | null {
  if (totalPowerUnits >= 1 && totalPowerUnits <= 3) return "new_mc";
  if (totalPowerUnits >= 4 && totalPowerUnits <= 10) return "small_fleet";
  return null;
}

function parseNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 0-100, business/safety factors only. Starts at a neutral 60 (already
// past the hard filters below, i.e. active authority + in-range power
// units + not an unsatisfactory safety rating) and moves from there.
function scoreCarrier(carrier: Record<string, unknown>): number {
  let score = 60;

  if (carrier.safetyRating === "S") score += 15;
  else if (carrier.safetyRating === "C") score -= 15;
  // null/no rating yet: common for a small or new carrier, not penalized.

  const vehicleOosRate = parseNum(carrier.vehicleOosRate);
  const vehicleOosNational = parseNum(carrier.vehicleOosRateNationalAverage);
  if (vehicleOosRate != null && vehicleOosNational != null) {
    score += vehicleOosRate < vehicleOosNational ? 10 : -10;
  }

  const driverOosRate = parseNum(carrier.driverOosRate);
  const driverOosNational = parseNum(carrier.driverOosRateNationalAverage);
  if (driverOosRate != null && driverOosNational != null) {
    score += driverOosRate < driverOosNational ? 10 : -10;
  }

  const crashTotal = parseNum(carrier.crashTotal);
  const totalPowerUnits = parseNum(carrier.totalPowerUnits);
  if (crashTotal != null && totalPowerUnits) {
    const crashesPerUnit = crashTotal / totalPowerUnits;
    if (crashesPerUnit === 0) score += 10;
    else if (crashesPerUnit > 0.5) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const imported: string[] = [];
    const skipped: { dotNumber: string; reason: string }[] = [];
    const failed: { dotNumber: string; error: string }[] = [];

    for (const dotNumber of dotNumbers) {
      try {
        const [carrierRes, docketRes] = await Promise.all([
          fmcsaGet(`/carriers/${dotNumber}`, webKey),
          fmcsaGet(`/carriers/${dotNumber}/docket-numbers`, webKey),
        ]);
        const carrier = carrierRes?.content?.carrier;
        if (!carrier) { skipped.push({ dotNumber, reason: "No carrier record returned" }); continue; }

        if (carrier.allowedToOperate !== "Y") {
          skipped.push({ dotNumber, reason: "Not allowed to operate" });
          continue;
        }
        if (carrier.safetyRating === "U") {
          skipped.push({ dotNumber, reason: "Unsatisfactory safety rating" });
          continue;
        }
        const totalPowerUnits = parseNum(carrier.totalPowerUnits);
        const segment = totalPowerUnits != null ? segmentFor(totalPowerUnits) : null;
        if (!segment) {
          skipped.push({ dotNumber, reason: `Power units (${carrier.totalPowerUnits ?? "none on file"}) outside 1-10 target range` });
          continue;
        }

        const docket = docketRes?.content?.[0];
        const mcNumber = docket ? `${docket.prefix ?? "MC"}-${docket.docketNumber}` : null;
        const homeBase = [carrier.phyCity, carrier.phyState].filter(Boolean).join(", ") || null;
        const fitScore = scoreCarrier(carrier);

        const row = {
          source: "fmcsa" as const,
          segment,
          mc_number: mcNumber,
          dot_number: String(dotNumber),
          company: carrier.dbaName || carrier.legalName || null,
          home_base: homeBase,
          power_units: totalPowerUnits,
          authority_date: null, // not available from this API -- see file header
          fit_score: fitScore,
        };

        const { data: existing } = await supabase.from("leads").select("id").eq("dot_number", String(dotNumber)).maybeSingle();
        if (existing) {
          const { error } = await supabase.from("leads").update(row).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("leads").insert(row);
          if (error) throw error;
        }
        imported.push(String(dotNumber));
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
