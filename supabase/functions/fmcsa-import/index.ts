// Owner-Operator Recruiting — FMCSA lead sourcing (module 2, FMCSA part)
//
// Pulls carrier data from FMCSA's QCMobile API for a given list of USDOT
// numbers and, per DOT number:
//   1. checks it against `excluded_entities` (never becomes a target -- no
//      snapshot, no lead, nothing written) via the `check_exclusion` SQL fn,
//   2. writes an append-only `carrier_snapshots` row,
//   3. derives vetting flags (ported from clg-recruiting's vetting.py --
//      see that file's git history / RECRUITING.md for the Python original),
//   4. scores the lead (ported from clg-recruiting's scoring.py, same
//      config-driven, coverage-based model, config embedded below and
//      stamped "provisional" until CLG names an approver),
//   5. upserts `leads` and inserts any newly-raised (not already-open)
//      `lead_vetting_flags`.
//
// FMCSA_WEB_KEY is a Supabase Edge Function secret -- it is fetched here via
// Deno.env and never sent to or read by the browser.
//
// Confirmed NOT available anywhere in this API (checked every _links
// sub-resource on the base carrier response: authority, docket-numbers,
// basics, operation-classification, cargo-carried; RECRUITING.md section 9a):
// an authority-granted/DOT-registration date, and any contact phone/email.
// Both are real gaps, not oversights:
//   - authority_granted_date is left null on every FMCSA-sourced snapshot/
//     lead. Segment (new_mc vs. small_fleet) is assigned on power units
//     alone instead (see segmentFor below) -- the Python model's
//     authority-age-based new_mc scoring band is honestly reported as a
//     missing/pending component (AUTHORITY_DATE_UNKNOWN flag, null
//     segment_fit) rather than guessed.
//   - phone/email are left null. FMCSA-sourced leads are structurally
//     incomplete for outreach until enriched from another source -- this
//     function only sources, vets, and scores; it never attempts outreach.
//
// Fair screening (RECRUITING.md section 8): every signal used below --
// authority status, safety rating, out-of-service rates, crash history,
// insurance on file, power units -- is a business/safety factor FMCSA
// itself publishes. Nothing about the carrier's owners/drivers as people is
// collected or scored.
//
// This is manual-trigger-by-DOT-list only (no bulk "search all carriers"
// endpoint exists in QCMobile) -- run via this function's Test button with
// body {"dotNumbers": ["<dot1>", "<dot2>", ...]}, or wire up a scheduled
// call with a maintained list later.

import { createClient } from "npm:@supabase/supabase-js@2";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// -----------------------------------------------------------------------
// Scoring config -- ported from clg-recruiting/config/scoring.yaml.
// STATUS: PROVISIONAL. Every number below is a placeholder written by the
// build, not a CLG-approved standard. While `status` is "provisional",
// every score this function writes is stamped score_status = 'provisional'
// and must not be treated as a governed recruiting decision.
// To approve: the designated recruiting approval authority reviews these
// values, sets status to "approved", fills approvedBy/approvedOn, and
// bumps version.
// -----------------------------------------------------------------------
const SCORING_CONFIG = {
  version: "0.1.0",
  status: "provisional" as "provisional" | "approved",
  approvedBy: null as string | null,
  approvedOn: null as string | null,
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
    new_mc: {
      authorityAgeDays: { min: 30, idealMin: 90, idealMax: 540, max: 730 },
      powerUnits: { min: 1, max: 3 },
    },
    small_fleet: {
      powerUnits: { min: 2, idealMin: 3, idealMax: 10, max: 25 },
    },
    driver: { scoringEnabled: false },
  },
};

// -----------------------------------------------------------------------
// CarrierProfile -- ported from clg-recruiting/recruiting/models.py.
// Unknown values stay null; nothing here guesses or defaults a missing
// field to 0/false.
// -----------------------------------------------------------------------
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
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

  authorityGrantedDate: string | null; // always null from this source -- see file header
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

function hasActiveAuthority(p: CarrierProfile): boolean | null {
  const statuses = [p.commonAuthorityStatus, p.contractAuthorityStatus];
  if (statuses.every((s) => s === null)) return null;
  return statuses.some((s) => (s || "").toUpperCase() === "A");
}

// -----------------------------------------------------------------------
// Vetting -- ported from clg-recruiting/recruiting/vetting.py.
// -----------------------------------------------------------------------
type FlagSeverity = "disqualifying" | "review" | "info";
interface Flag { code: string; severity: FlagSeverity; detail: string }

function deriveFlags(p: CarrierProfile, segment: string, cfg: typeof SCORING_CONFIG): Flag[] {
  const flags: Flag[] = [];
  const add = (code: string, severity: FlagSeverity, detail: string) => flags.push({ code, severity, detail });

  // --- disqualifying ---
  if (p.allowedToOperate === false) add("NOT_ALLOWED_TO_OPERATE", "disqualifying", "FMCSA reports allowedToOperate = N");
  if (p.oosDate !== null) add("OUT_OF_SERVICE_ORDER", "disqualifying", `Out-of-service date ${p.oosDate}`);
  if (hasActiveAuthority(p) === false) {
    add("NO_ACTIVE_AUTHORITY", "disqualifying", `common=${p.commonAuthorityStatus} contract=${p.contractAuthorityStatus}`);
  }
  if (p.safetyRating && p.safetyRating.startsWith("U")) add("UNSATISFACTORY_RATING", "disqualifying", `Safety rating ${p.safetyRating}`);
  if (p.bipdOnFile !== null && p.bipdRequired !== null && p.bipdOnFile < p.bipdRequired) {
    add("INSURANCE_BELOW_REQUIRED", "disqualifying", `BIPD on file ${p.bipdOnFile} < required ${p.bipdRequired}`);
  }

  // --- review ---
  if (p.safetyRating && p.safetyRating.startsWith("C")) add("CONDITIONAL_RATING", "review", `Safety rating ${p.safetyRating}`);
  if (p.fatalCrash) add("FATAL_CRASH", "review", `${p.fatalCrash} fatal crash(es)`);

  const minInsp = cfg.minInspectionsForRate;
  for (const kind of ["driver", "vehicle"] as const) {
    const insp = kind === "driver" ? p.driverInspections : p.vehicleInspections;
    const rate = kind === "driver" ? p.driverOosRate : p.vehicleOosRate;
    const natl = kind === "driver" ? p.driverOosRateNatl : p.vehicleOosRateNatl;
    if (insp !== null && insp >= minInsp && rate !== null && natl && rate > natl) {
      add(`${kind.toUpperCase()}_OOS_ABOVE_NATL`, "review", `${kind} OOS ${rate.toFixed(1)}% vs national ${natl.toFixed(1)}% (${insp} inspections)`);
    }
  }

  if (p.mcs150Outdated === true) add("MCS150_OUTDATED", "review", "MCS-150 update overdue");

  const segCfg = (cfg.segments as Record<string, { powerUnits?: { min?: number; max?: number } }>)[segment] || {};
  const puCfg = segCfg.powerUnits;
  if (puCfg && p.powerUnits !== null) {
    const { min: lo, max: hi } = puCfg;
    if ((lo !== undefined && p.powerUnits < lo) || (hi !== undefined && p.powerUnits > hi)) {
      add("FLEET_SIZE_OUT_OF_RANGE", "review", `${p.powerUnits} power units outside ${lo}-${hi} for ${segment}`);
    }
  }

  // --- info ---
  if (segment === "new_mc" && p.authorityGrantedDate === null) {
    add("AUTHORITY_DATE_UNKNOWN", "info", "No verified authority grant date; authority-age fit is pending");
  }
  const totalInsp = (p.driverInspections ?? 0) + (p.vehicleInspections ?? 0);
  if (p.driverInspections !== null && totalInsp < minInsp) {
    add("LOW_INSPECTION_HISTORY", "info", `${totalInsp} total inspections`);
  }

  return flags;
}

function isDisqualified(flags: Flag[]): boolean {
  return flags.some((f) => f.severity === "disqualifying");
}

// -----------------------------------------------------------------------
// Scoring -- ported from clg-recruiting/recruiting/scoring.py.
// Rules: disqualified -> no score (not zero). Each component is 0..1 or
// null when data is missing. Score normalizes over components that have
// data; coverage below minCoverage -> "pending", no score. score_status
// mirrors the config's own status ("provisional" until approved).
// -----------------------------------------------------------------------
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
    // authorityGrantedDate is always null from this data source (see file
    // header) -- honestly reported as missing rather than guessed.
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

function scoreLead(p: CarrierProfile | null, segment: string, flags: Flag[], cfg: typeof SCORING_CONFIG): ScoreResult {
  const version = cfg.version;

  if (isDisqualified(flags)) {
    const codes = flags.filter((f) => f.severity === "disqualifying").map((f) => f.code);
    return { outcome: "disqualified", score: null, scoreStatus: null, coverage: 0, version, components: {}, reasons: [`disqualified: ${codes.join(", ")}`] };
  }

  if (segment === "driver") {
    if (!cfg.segments.driver.scoringEnabled) {
      return { outcome: "pending", score: null, scoreStatus: "pending", coverage: 0, version, components: {}, reasons: ["driver scoring not enabled: no driver data source wired yet"] };
    }
  }

  if (p === null) {
    return { outcome: "pending", score: null, scoreStatus: "pending", coverage: 0, version, components: {}, reasons: ["no FMCSA snapshot"] };
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
  const reasons = pending.length ? [`pending components: ${pending.join(", ")}`] : [];

  if (coverage < cfg.minCoverage || haveW === 0) {
    reasons.push(`coverage ${(coverage * 100).toFixed(0)}% below minimum ${(cfg.minCoverage * 100).toFixed(0)}%`);
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

// Power units alone (1-3 -> new_mc, 4-10 -> small_fleet) -- authority age
// would normally also decide new_mc vs. small_fleet per RECRUITING.md
// section 3, but FMCSA doesn't expose that date (see file header). Outside
// 1-10 entirely, or no power units on file: not a fit for either offer this
// sourcing pass targets, so the caller skips it rather than importing with
// a guessed segment.
function segmentFor(totalPowerUnits: number | null): "new_mc" | "small_fleet" | null {
  if (totalPowerUnits === null) return null;
  if (totalPowerUnits >= 1 && totalPowerUnits <= 3) return "new_mc";
  if (totalPowerUnits >= 4 && totalPowerUnits <= 10) return "small_fleet";
  return null;
}

async function fmcsaGet(path: string, webKey: string) {
  const url = new URL(`${FMCSA_BASE}${path}`);
  url.searchParams.set("webKey", webKey);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 300)}`);
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const imported: Record<string, unknown>[] = [];
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
        if (excluded) { skipped.push({ dotNumber, reason: `Excluded entity: ${excluded}` }); continue; }

        const segment = segmentFor(profile.powerUnits);
        if (!segment) {
          skipped.push({ dotNumber, reason: `Power units (${carrier.totalPowerUnits ?? "none on file"}) outside 1-10 target range` });
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

        const flags = deriveFlags(profile, segment, SCORING_CONFIG);
        const scoreResult = scoreLead(profile, segment, flags, SCORING_CONFIG);
        const disqualifyingFlags = flags.filter((f) => f.severity === "disqualifying");
        const disqualifiedReason = disqualifyingFlags.length
          ? disqualifyingFlags.map((f) => `${f.code}: ${f.detail}`).join("; ")
          : null;

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
          fit_score: scoreResult.score,
          score_status: scoreResult.scoreStatus,
          score_coverage: scoreResult.coverage,
          score_version: scoreResult.version,
          score_breakdown: { outcome: scoreResult.outcome, components: scoreResult.components, coverage: Math.round(scoreResult.coverage * 1000) / 1000, reasons: scoreResult.reasons },
          scored_at: new Date().toISOString(),
        };
        // Only ever set on the way IN to disqualified -- clearing it back
        // out is a human vetting decision (RECRUITING.md), never automatic.
        if (disqualifiedReason) {
          leadRow.disqualified_reason = disqualifiedReason;
          leadRow.status = "disqualified";
        }

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

        if (flags.length) {
          const { data: openFlags } = await supabase.from("lead_vetting_flags").select("flag_code").eq("lead_id", leadId).eq("state", "open");
          const alreadyOpen = new Set((openFlags ?? []).map((f) => f.flag_code));
          const newFlags = flags.filter((f) => !alreadyOpen.has(f.code));
          if (newFlags.length) {
            const { error } = await supabase.from("lead_vetting_flags").insert(
              newFlags.map((f) => ({ lead_id: leadId, flag_code: f.code, severity: f.severity, detail: f.detail, snapshot_id: snapshot.id })),
            );
            if (error) throw error;
          }
        }

        imported.push({ dotNumber: String(dotNumber), leadId, segment, outcome: scoreResult.outcome, fitScore: scoreResult.score });
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
