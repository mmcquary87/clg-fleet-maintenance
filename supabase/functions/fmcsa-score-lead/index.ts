// Owner-Operator Recruiting -- vetting + scoring for one lead.
// Split out of fmcsa-import (2026-09-28) to keep each Edge Function small
// enough to paste reliably -- no behavior change. fmcsa-import calls this
// right after creating/updating a lead's snapshot; can also run standalone
// via Test with body {"leadId": "<uuid>"}. Ported from clg-recruiting's
// vetting.py/scoring.py -- see fmcsa-import's header and RECRUITING.md.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCORING_CONFIG = {
  version: "0.1.0",
  status: "provisional" as "provisional" | "approved",
  minCoverage: 0.60,
  minInspectionsForRate: 3,
  weights: {
    driver_oos: 20,
    vehicle_oos: 20,
    crash_history: 15,
    insurance: 15,
    mcs150_current: 5,
    segment_fit: 25,
  } as Record<string, number>,
  oosRatio: { fullCreditRatio: 0.75, zeroCreditRatio: 1.50 },
  crashHistory: { fatalCrashPoints: 0.0, perInjuryCrashPenalty: 0.25, perTowawayCrashPenalty: 0.15 },
  segments: {
    new_mc: { authorityAgeDays: { min: 30, idealMin: 90, idealMax: 540, max: 730 } },
    small_fleet: { powerUnits: { min: 2, idealMin: 3, idealMax: 10, max: 25 } },
    driver: { scoringEnabled: false },
  },
};

interface CarrierProfile {
  allowedToOperate: boolean | null;
  oosDate: string | null;
  commonAuthorityStatus: string | null;
  contractAuthorityStatus: string | null;
  authorityGrantedDate: string | null;
  powerUnits: number | null;
  safetyRating: string | null;
  driverInspections: number | null;
  driverOosRate: number | null;
  driverOosRateNatl: number | null;
  vehicleInspections: number | null;
  vehicleOosRate: number | null;
  vehicleOosRateNatl: number | null;
  crashTotal: number | null;
  fatalCrash: number | null;
  injuryCrash: number | null;
  towawayCrash: number | null;
  bipdOnFile: number | null;
  bipdRequired: number | null;
  mcs150Outdated: boolean | null;
}

// carrier_snapshots row (snake_case columns) -> CarrierProfile (camelCase).
function profileFromSnapshotRow(row: Record<string, unknown>): CarrierProfile {
  return {
    allowedToOperate: row.allowed_to_operate as boolean | null,
    oosDate: row.oos_date as string | null,
    commonAuthorityStatus: row.common_authority_status as string | null,
    contractAuthorityStatus: row.contract_authority_status as string | null,
    authorityGrantedDate: row.authority_granted_date as string | null,
    powerUnits: row.power_units as number | null,
    safetyRating: row.safety_rating as string | null,
    driverInspections: row.driver_inspections as number | null,
    driverOosRate: row.driver_oos_rate as number | null,
    driverOosRateNatl: row.driver_oos_rate_natl as number | null,
    vehicleInspections: row.vehicle_inspections as number | null,
    vehicleOosRate: row.vehicle_oos_rate as number | null,
    vehicleOosRateNatl: row.vehicle_oos_rate_natl as number | null,
    crashTotal: row.crash_total as number | null,
    fatalCrash: row.fatal_crash as number | null,
    injuryCrash: row.injury_crash as number | null,
    towawayCrash: row.towaway_crash as number | null,
    bipdOnFile: row.bipd_on_file as number | null,
    bipdRequired: row.bipd_required as number | null,
    mcs150Outdated: row.mcs150_outdated as boolean | null,
  };
}

function hasActiveAuthority(p: CarrierProfile): boolean | null {
  const statuses = [p.commonAuthorityStatus, p.contractAuthorityStatus];
  if (statuses.every((s) => s === null)) return null;
  return statuses.some((s) => (s || "").toUpperCase() === "A");
}

type FlagSeverity = "disqualifying" | "review" | "info";
interface Flag { code: string; severity: FlagSeverity; detail: string }

function deriveFlags(p: CarrierProfile, segment: string, cfg: typeof SCORING_CONFIG): Flag[] {
  const flags: Flag[] = [];
  const add = (code: string, severity: FlagSeverity, detail: string) => flags.push({ code, severity, detail });

  if (p.allowedToOperate === false) add("NOT_ALLOWED_TO_OPERATE", "disqualifying", "FMCSA reports allowedToOperate = N");
  if (p.oosDate !== null) add("OUT_OF_SERVICE_ORDER", "disqualifying", "Out-of-service date " + p.oosDate);
  if (hasActiveAuthority(p) === false) {
    add("NO_ACTIVE_AUTHORITY", "disqualifying", "common=" + p.commonAuthorityStatus + " contract=" + p.contractAuthorityStatus);
  }
  if (p.safetyRating && p.safetyRating.startsWith("U")) add("UNSATISFACTORY_RATING", "disqualifying", "Safety rating " + p.safetyRating);
  if (p.bipdOnFile !== null && p.bipdRequired !== null && p.bipdOnFile < p.bipdRequired) {
    add("INSURANCE_BELOW_REQUIRED", "disqualifying", "BIPD on file " + p.bipdOnFile + " < required " + p.bipdRequired);
  }

  if (p.safetyRating && p.safetyRating.startsWith("C")) add("CONDITIONAL_RATING", "review", "Safety rating " + p.safetyRating);
  if (p.fatalCrash) add("FATAL_CRASH", "review", p.fatalCrash + " fatal crash(es)");

  const minInsp = cfg.minInspectionsForRate;
  if (p.driverInspections !== null && p.driverInspections >= minInsp && p.driverOosRate !== null && p.driverOosRateNatl && p.driverOosRate > p.driverOosRateNatl) {
    add("DRIVER_OOS_ABOVE_NATL", "review", "driver OOS " + p.driverOosRate.toFixed(1) + "% vs national " + p.driverOosRateNatl.toFixed(1) + "% (" + p.driverInspections + " inspections)");
  }
  if (p.vehicleInspections !== null && p.vehicleInspections >= minInsp && p.vehicleOosRate !== null && p.vehicleOosRateNatl && p.vehicleOosRate > p.vehicleOosRateNatl) {
    add("VEHICLE_OOS_ABOVE_NATL", "review", "vehicle OOS " + p.vehicleOosRate.toFixed(1) + "% vs national " + p.vehicleOosRateNatl.toFixed(1) + "% (" + p.vehicleInspections + " inspections)");
  }
  if (p.mcs150Outdated === true) add("MCS150_OUTDATED", "review", "MCS-150 update overdue");

  if (segment === "new_mc" && p.authorityGrantedDate === null) {
    add("AUTHORITY_DATE_UNKNOWN", "info", "No verified authority grant date; authority-age fit is pending");
  }
  const totalInsp = (p.driverInspections ?? 0) + (p.vehicleInspections ?? 0);
  if (p.driverInspections !== null && totalInsp < minInsp) {
    add("LOW_INSPECTION_HISTORY", "info", totalInsp + " total inspections");
  }

  return flags;
}

function isDisqualified(flags: Flag[]): boolean {
  return flags.some((f) => f.severity === "disqualifying");
}

interface ScoreResult {
  outcome: "scored" | "pending" | "disqualified";
  score: number | null;
  scoreStatus: "provisional" | "approved" | "pending" | null;
  coverage: number;
  version: string;
  components: Record<string, number | null>;
  reasons: string[];
}

function band(value: number, lo: number, idealLo: number, idealHi: number, hi: number): number {
  if (value < lo || value > hi) return 0.0;
  if (value < idealLo) return idealLo > lo ? (value - lo) / (idealLo - lo) : 1.0;
  if (value > idealHi) return hi > idealHi ? (hi - value) / (hi - idealHi) : 1.0;
  return 1.0;
}

function oosComponent(rate: number | null, natl: number | null, inspections: number | null, cfg: typeof SCORING_CONFIG): number | null {
  if (rate === null || !natl || inspections === null) return null;
  if (inspections < cfg.minInspectionsForRate) return null;
  const { fullCreditRatio: full, zeroCreditRatio: zero } = cfg.oosRatio;
  const ratio = rate / natl;
  if (ratio <= full) return 1.0;
  if (ratio >= zero) return 0.0;
  return (zero - ratio) / (zero - full);
}

function crashComponent(p: CarrierProfile, cfg: typeof SCORING_CONFIG): number | null {
  if (p.crashTotal === null) return null;
  const c = cfg.crashHistory;
  if (p.fatalCrash) return c.fatalCrashPoints;
  const penalty = (p.injuryCrash ?? 0) * c.perInjuryCrashPenalty + (p.towawayCrash ?? 0) * c.perTowawayCrashPenalty;
  return Math.max(0.0, 1.0 - penalty);
}

function insuranceComponent(p: CarrierProfile): number | null {
  if (p.bipdOnFile === null || p.bipdRequired === null) return null;
  if (p.bipdRequired === 0) return p.bipdOnFile > 0 ? 1.0 : null;
  return p.bipdOnFile >= p.bipdRequired ? 1.0 : 0.0;
}

function mcs150Component(p: CarrierProfile): number | null {
  if (p.mcs150Outdated === null) return null;
  return p.mcs150Outdated ? 0.0 : 1.0;
}

function segmentFitComponent(p: CarrierProfile, segment: string, cfg: typeof SCORING_CONFIG): number | null {
  if (segment === "new_mc") {
    if (p.authorityGrantedDate === null) return null;
    const a = cfg.segments.new_mc.authorityAgeDays;
    const ageDays = Math.floor((Date.now() - new Date(p.authorityGrantedDate).getTime()) / 86_400_000);
    return band(ageDays, a.min, a.idealMin, a.idealMax, a.max);
  }
  if (segment === "small_fleet") {
    if (p.powerUnits === null) return null;
    const pu = cfg.segments.small_fleet.powerUnits;
    return band(p.powerUnits, pu.min, pu.idealMin, pu.idealMax, pu.max);
  }
  return null;
}

function scoreLead(p: CarrierProfile, segment: string, flags: Flag[], cfg: typeof SCORING_CONFIG): ScoreResult {
  const version = cfg.version;

  if (isDisqualified(flags)) {
    const codes = flags.filter((f) => f.severity === "disqualifying").map((f) => f.code);
    return { outcome: "disqualified", score: null, scoreStatus: null, coverage: 0, version, components: {}, reasons: ["disqualified: " + codes.join(", ")] };
  }
  if (segment === "driver" && !cfg.segments.driver.scoringEnabled) {
    return { outcome: "pending", score: null, scoreStatus: "pending", coverage: 0, version, components: {}, reasons: ["driver scoring not enabled: no driver data source wired yet"] };
  }

  const components: Record<string, number | null> = {
    driver_oos: oosComponent(p.driverOosRate, p.driverOosRateNatl, p.driverInspections, cfg),
    vehicle_oos: oosComponent(p.vehicleOosRate, p.vehicleOosRateNatl, p.vehicleInspections, cfg),
    crash_history: crashComponent(p, cfg),
    insurance: insuranceComponent(p),
    mcs150_current: mcs150Component(p),
    segment_fit: segmentFitComponent(p, segment, cfg),
  };
  const weights = cfg.weights;
  const totalW = Object.keys(components).reduce((s, k) => s + (weights[k] ?? 0), 0);
  const haveW = Object.entries(components).reduce((s, [k, v]) => s + (v !== null ? weights[k] ?? 0 : 0), 0);
  const coverage = totalW ? haveW / totalW : 0;
  const pending = Object.entries(components).filter(([, v]) => v === null).map(([k]) => k);
  const reasons = pending.length ? ["pending components: " + pending.join(", ")] : [];

  if (coverage < cfg.minCoverage || haveW === 0) {
    reasons.push("coverage " + (coverage * 100).toFixed(0) + "% below minimum " + (cfg.minCoverage * 100).toFixed(0) + "%");
    return { outcome: "pending", score: null, scoreStatus: "pending", coverage, version, components, reasons };
  }

  const raw = Object.entries(components).reduce((s, [k, v]) => s + (v !== null ? (weights[k] ?? 0) * v : 0), 0) / haveW;
  return {
    outcome: "scored",
    score: Math.round(raw * 100 * 10) / 10,
    scoreStatus: cfg.status,
    coverage,
    version,
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, v !== null ? Math.round(v * 1000) / 1000 : null])),
    reasons,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId) throw new Error('Body must include "leadId"');

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await supabase.from("leads").select("id, segment, latest_snapshot_id").eq("id", leadId).single();
    if (leadErr) throw leadErr;
    if (!lead.latest_snapshot_id) throw new Error("Lead has no carrier_snapshots row to score from");

    const { data: snapshot, error: snapErr } = await supabase.from("carrier_snapshots").select("*").eq("id", lead.latest_snapshot_id).single();
    if (snapErr) throw snapErr;

    const profile = profileFromSnapshotRow(snapshot);
    const flags = deriveFlags(profile, lead.segment, SCORING_CONFIG);
    const scoreResult = scoreLead(profile, lead.segment, flags, SCORING_CONFIG);
    const disqualifyingFlags = flags.filter((f) => f.severity === "disqualifying");
    const disqualifiedReason = disqualifyingFlags.length
      ? disqualifyingFlags.map((f) => f.code + ": " + f.detail).join("; ")
      : null;

    const leadUpdate: Record<string, unknown> = {
      fit_score: scoreResult.score,
      score_status: scoreResult.scoreStatus,
      score_coverage: scoreResult.coverage,
      score_version: scoreResult.version,
      score_breakdown: { outcome: scoreResult.outcome, components: scoreResult.components, coverage: Math.round(scoreResult.coverage * 1000) / 1000, reasons: scoreResult.reasons },
      scored_at: new Date().toISOString(),
    };
    // Only set on the way IN to disqualified; clearing it is a human call.
    if (disqualifiedReason) {
      leadUpdate.disqualified_reason = disqualifiedReason;
      leadUpdate.status = "disqualified";
    }
    const { error: updErr } = await supabase.from("leads").update(leadUpdate).eq("id", leadId);
    if (updErr) throw updErr;

    if (flags.length) {
      const { data: openFlags } = await supabase.from("lead_vetting_flags").select("flag_code").eq("lead_id", leadId).eq("state", "open");
      const alreadyOpen = new Set((openFlags ?? []).map((f) => f.flag_code));
      const newFlags = flags.filter((f) => !alreadyOpen.has(f.code));
      if (newFlags.length) {
        const { error: flagErr } = await supabase.from("lead_vetting_flags").insert(
          newFlags.map((f) => ({ lead_id: leadId, flag_code: f.code, severity: f.severity, detail: f.detail, snapshot_id: lead.latest_snapshot_id })),
        );
        if (flagErr) throw flagErr;
      }
    }

    return new Response(JSON.stringify({ leadId, outcome: scoreResult.outcome, fitScore: scoreResult.score, flagsRaised: flags.length }, null, 2), {
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
