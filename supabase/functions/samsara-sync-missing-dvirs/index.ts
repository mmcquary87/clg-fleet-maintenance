// Fleet Maintenance System — Samsara Missing Pre-Trip DVIR sync (UAT #10/#11)
//
// v2 — replaces an earlier version that checked DVIR coverage against every
// raw /trips/stream GPS segment (confirmed via real data: a single driver's
// workday is ~17 separate GPS segments, none of which individually mean
// "start of a new shift"; that version flagged 141/234 evaluated trips vs.
// the real fleet's ~4-6 rows/day — unusable, never shipped to cron).
//
// Calibrated against CLG's real "Missing DVIR Report" CSV export for
// 2026-11-09 (6 rows; 2 are trailer-only DVIRs, out of scope — Samsara's
// driver-vehicle-assignments/HOS logs carry no trailer field, confirmed via
// direct API data) using /fleet/hos/logs duty-status transitions instead:
//
//   - A driver's workday "shift start" = a `driving` HOS log entry preceded
//     by >= MIN_REST_HOURS_FOR_SHIFT_START (10h, the FMCSA property-carrier
//     daily off-duty minimum) of continuous non-driving time. Matched 3 of
//     the CSV's 4 vehicle-level rows (Jack White Jr 07:25, Michael Dwight
//     07:34, Bryan Smith 13:58 — all confirmed to the minute) and correctly
//     did NOT match Dejuan Parker's second rest-separated period that same
//     day (~3h rest, not in the CSV).
//   - Known accepted gap: the CSV's 4th row (Dejuan Parker, mid-afternoon,
//     12:23 EST) is a mid-shift trip that Samsara's own dashboard flags via
//     trip-segmentation logic we can't reproduce (confirmed via his real
//     DVIR history: his only pre-trip that day, at 09:20 EST, covered every
//     driving segment through ~15:20 EST; several short post-15:20 stop/go
//     segments exist and only ONE is in Samsara's report, meaning Samsara
//     merges brief fuel/logistics stops into one "trip" rather than
//     treating each duty-status flicker as its own trip — that merge logic
//     is dashboard-internal with no API equivalent). This sync intentionally
//     only catches true shift-start misses, the highest-value case.
//   - DVIR coverage window matches Samsara's own documented rule: a pre-trip
//     DVIR for the SAME vehicle within [shiftStart - 4h, shiftStart + 1h].
//   - Jack White's and Michael Dwight's CSV rows turned out to have real,
//     on-time pre-trip DVIRs after all (confirmed via a properly-paginated
//     DVIR history fetch — an earlier un-paginated probe had missed them
//     entirely), one submitted by the driver himself and one by his
//     team-driving codriver — the CSV export appears to be a stale
//     snapshot rather than ground truth.
//
// Requires SAMSARA_API secret + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_WINDOW_DAYS = 1;
const HOS_LOOKBACK_HOURS = 96; // how far before windowStart to pull HOS logs, to see the real rest gap before a shift start near the window boundary (covers normal weekends; a rare longer holiday break could still be missed)
const MIN_REST_MS_FOR_SHIFT_START = 10 * 3600 * 1000; // FMCSA property-carrier minimum daily off-duty period
const DVIR_LOOKBACK_PAD_MS = 4 * 3600 * 1000; // Samsara's own documented "missing DVIR" coverage window: up to 4h before
const GRACE_PERIOD_MS = 1 * 3600 * 1000; // ...to 1h after a shift start; also used to avoid flagging a shift that hasn't had time to get its DVIR yet
const RECONCILE_DAYS = 2; // re-evaluate/clear stale rows this far back on every run, in case a DVIR was submitted late

function authHeaders() {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  return { Authorization: `Bearer ${token}` };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path: string, params: Record<string, string>) {
  const url = new URL(`${SAMSARA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 429) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
    try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
  }
  throw new Error(`${path} failed: exceeded rate limit after retries`);
}

async function fetchAllPages(path: string, params: Record<string, string>) {
  const items: any[] = [];
  let after: string | undefined;
  let pages = 0;
  while (true) {
    const json = await fetchJson(path, after ? { ...params, after } : params);
    items.push(...(json.data ?? []));
    pages += 1;
    if (!json.pagination?.hasNextPage || pages > 200) break;
    after = json.pagination.endCursor;
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* no body (cron ping) */ }

    const now = new Date();
    const windowEnd = body.endDate ? new Date(body.endDate) : now;
    const windowStart = body.startDate
      ? new Date(body.startDate)
      : new Date(windowEnd.getTime() - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000);
    const mode = body.startDate || body.endDate ? "backfill" : "incremental";

    const hosFetchStart = new Date(windowStart.getTime() - HOS_LOOKBACK_HOURS * 3600 * 1000);
    const dvirFetchStart = new Date(windowStart.getTime() - DVIR_LOOKBACK_PAD_MS);

    // --- HOS logs, fleet-wide, fully paginated, merged per driver (a
    // driver's hosLogs can be split across pages) ---
    // NOTE: fleet-wide (no driverIds filter) silently zeroes out `vehicle.id`
    // on every entry (confirmed via real data — same entries that show a
    // real vehicle id on a single-driver-scoped call come back with
    // vehicle.id "0" here). Timing/duty-status fields are still accurate,
    // so this is used only to find candidate shift starts; the real
    // vehicle id for each candidate is looked up with a narrow per-driver
    // follow-up call below.
    const hosPages = await fetchAllPages("/fleet/hos/logs", {
      startTime: hosFetchStart.toISOString(),
      endTime: windowEnd.toISOString(),
    });
    const hosLogsByDriver = new Map<string, { name: string; logs: any[] }>();
    for (const entry of hosPages) {
      const driverId = entry.driver?.id;
      if (!driverId) continue;
      const bucket = hosLogsByDriver.get(driverId) ?? { name: entry.driver?.name, logs: [] };
      bucket.logs.push(...(entry.hosLogs ?? []));
      hosLogsByDriver.set(driverId, bucket);
    }
    for (const bucket of hosLogsByDriver.values()) {
      bucket.logs.sort((a, b) => new Date(a.logStartTime).getTime() - new Date(b.logStartTime).getTime());
    }

    // --- Pre-trip DVIRs, fleet-wide, fully paginated, indexed per vehicle ---
    const dvirPages = await fetchAllPages("/fleet/dvirs/history", {
      startTime: dvirFetchStart.toISOString(),
      endTime: windowEnd.toISOString(),
    });
    const preTripDvirTimesByVehicle = new Map<string, number[]>();
    for (const dvir of dvirPages) {
      if (dvir.type !== "preTrip") continue;
      const vehicleId = dvir.vehicle?.id;
      if (!vehicleId) continue; // trailer-only DVIRs have no vehicle.id — out of scope, see header
      const t = new Date(dvir.startTime).getTime();
      const arr = preTripDvirTimesByVehicle.get(vehicleId) ?? [];
      arr.push(t);
      preTripDvirTimesByVehicle.set(vehicleId, arr);
    }
    for (const arr of preTripDvirTimesByVehicle.values()) arr.sort((a, b) => a - b);

    function hasCoveringDvir(vehicleId: string, shiftStartMs: number) {
      const times = preTripDvirTimesByVehicle.get(vehicleId);
      if (!times) return false;
      const lo = shiftStartMs - DVIR_LOOKBACK_PAD_MS;
      const hi = shiftStartMs + GRACE_PERIOD_MS;
      // small arrays (per vehicle, per ~5-day window) — linear scan is fine
      return times.some((t) => t >= lo && t <= hi);
    }

    // --- Identity lookups ---
    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, samsara_vehicle_id").not("samsara_vehicle_id", "is", null);
    if (unitsErr) throw unitsErr;
    const unitIdByVehicleId = new Map(units.map((u: any) => [u.samsara_vehicle_id, u.id]));

    const { data: drivers, error: driversErr } = await supabase
      .from("drivers").select("id, samsara_driver_id").not("samsara_driver_id", "is", null);
    if (driversErr) throw driversErr;
    const driverIdBySamsaraId = new Map(drivers.map((d: any) => [d.samsara_driver_id, d.id]));

    // --- Walk each driver's sorted HOS logs, find shift-start candidates
    // (timing only — vehicle id is unreliable in this fleet-wide fetch) ---
    const candidates: { samsaraDriverId: string; logStartTime: string; logEndTime: string }[] = [];

    for (const [samsaraDriverId, bucket] of hosLogsByDriver) {
      let lastDrivingEndMs: number | null = null;
      for (const entry of bucket.logs) {
        const statusType = entry.hosStatusType;
        const startMs = new Date(entry.logStartTime).getTime();
        const endMs = new Date(entry.logEndTime).getTime();

        if (statusType === "driving") {
          // No driving seen yet this run means no driving since
          // hosFetchStart — compare the gap against that instead of
          // against null, so a confirmed multi-day rest (e.g. a weekend
          // off) still counts as a shift start. Only truly ambiguous when
          // this entry itself starts right at hosFetchStart (no visibility
          // further back at all).
          const sinceMs = lastDrivingEndMs ?? hosFetchStart.getTime();
          const restMs = startMs - sinceMs;
          const isShiftStart = restMs >= MIN_REST_MS_FOR_SHIFT_START;
          const hasVisibility = lastDrivingEndMs !== null || startMs > hosFetchStart.getTime();
          const inWindow = startMs >= windowStart.getTime() && startMs <= windowEnd.getTime();
          const pastGrace = startMs + GRACE_PERIOD_MS <= now.getTime();

          if (isShiftStart && hasVisibility && inWindow && pastGrace) {
            candidates.push({ samsaraDriverId, logStartTime: entry.logStartTime, logEndTime: entry.logEndTime });
          }
          lastDrivingEndMs = endMs;
        }
      }
    }

    // --- For each candidate, a narrow per-driver call to get the real
    // vehicle id (small, bounded set — not one call per active driver) ---
    const CONCURRENCY = 3;
    const vehicleIdByCandidate = new Map<string, string | null>();
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      if (i > 0) await sleep(300);
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (c) => {
        const t = new Date(c.logStartTime).getTime();
        const pad = 2 * 3600 * 1000;
        const narrow = await fetchAllPages("/fleet/hos/logs", {
          driverIds: c.samsaraDriverId,
          startTime: new Date(t - pad).toISOString(),
          endTime: new Date(t + pad).toISOString(),
        });
        const logs = narrow.flatMap((d: any) => d.hosLogs ?? []);
        const match = logs.find((l: any) => l.logStartTime === c.logStartTime && l.hosStatusType === "driving");
        return match?.vehicle?.id ?? null;
      }));
      batch.forEach((c, idx) => {
        vehicleIdByCandidate.set(`${c.samsaraDriverId}:${c.logStartTime}`, results[idx]);
      });
    }

    let shiftStartsEvaluated = 0;
    const missingRows: any[] = [];
    const evaluatedIds = new Set<string>();

    for (const c of candidates) {
      const key = `${c.samsaraDriverId}:${c.logStartTime}`;
      const vehicleId = vehicleIdByCandidate.get(key);
      if (!vehicleId || vehicleId === "0") continue; // trailer-only / unresolved — out of scope, see header
      shiftStartsEvaluated += 1;
      evaluatedIds.add(key);
      const startMs = new Date(c.logStartTime).getTime();
      if (!hasCoveringDvir(vehicleId, startMs)) {
        missingRows.push({
          id: key,
          unit_id: unitIdByVehicleId.get(vehicleId) ?? null,
          samsara_vehicle_id: vehicleId,
          driver_id: driverIdBySamsaraId.get(c.samsaraDriverId) ?? null,
          samsara_driver_id: c.samsaraDriverId,
          trip_start_time: c.logStartTime,
          trip_end_time: c.logEndTime,
          detected_at: now.toISOString(),
          synced_at: now.toISOString(),
        });
      }
    }

    const dedupedMissing = Array.from(new Map(missingRows.map((r) => [r.id, r])).values());

    let upserted = 0;
    if (dedupedMissing.length > 0) {
      const { error } = await supabase.from("missing_dvirs").upsert(dedupedMissing, { onConflict: "id" });
      if (error) throw error;
      upserted = dedupedMissing.length;
    }

    // Reconcile: clear previously-flagged rows in this window that we
    // re-evaluated this run and found either covered now or no longer a
    // shift start (e.g. a late DVIR submission cleared it).
    const { data: existingInWindow, error: existingErr } = await supabase
      .from("missing_dvirs")
      .select("id")
      .gte("trip_start_time", new Date(windowStart.getTime() - RECONCILE_DAYS * 24 * 3600 * 1000).toISOString())
      .lte("trip_start_time", windowEnd.toISOString());
    if (existingErr) throw existingErr;

    const staleIds = (existingInWindow ?? [])
      .map((r: any) => r.id)
      .filter((id: string) => evaluatedIds.has(id) && !dedupedMissing.some((r) => r.id === id));
    let cleared = 0;
    if (staleIds.length > 0) {
      const { error: delErr } = await supabase.from("missing_dvirs").delete().in("id", staleIds);
      if (delErr) throw delErr;
      cleared = staleIds.length;
    }

    return new Response(JSON.stringify({
      mode,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      driversWithHosActivity: hosLogsByDriver.size,
      shiftStartsEvaluated,
      missingDvirsUpserted: upserted,
      staleRowsCleared: cleared,
      preTripDvirsFetched: dvirPages.filter((d) => d.type === "preTrip").length,
      shiftStartCandidates: candidates.length,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const details = (err && typeof err === "object" && "details" in err) ? (err as any).details : undefined;
    const hint = (err && typeof err === "object" && "hint" in err) ? (err as any).hint : undefined;
    const code = (err && typeof err === "object" && "code" in err) ? (err as any).code : undefined;
    return new Response(JSON.stringify({ error: message, details, hint, code }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
