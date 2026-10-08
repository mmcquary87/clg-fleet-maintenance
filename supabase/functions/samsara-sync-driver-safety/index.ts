// Fleet Maintenance System — Samsara Driver Safety Scorecard sync
//
// Ports CLG's existing Power BI "Driver Safety Scorecard" (built on
// Samsara's official Power BI connector) into CLGos, pulling the same data
// directly from Samsara's REST API. Shapes confirmed via
// samsara-explore-driver-safety (rounds 1-3) against real data — see
// 20261007000000_driver_safety_scorecard.sql's header comment for the
// per-endpoint gotchas (driverIds silently ignored on safety-events,
// RFC3339 timestamps required on fuel-energy, no per-row id on violations
// or speeding intervals).
//
// Window: a short trailing default (1 day), meant to run every 15 minutes
// via pg_cron like every other samsara-sync-* function in this repo —
// history accumulates in Postgres across runs, this never tries to
// backfill months of data in one synchronous call. The first real test
// run confirmed why: /speeding-intervals/stream returns every individual
// interval (including "light" severity, which fires almost continuously
// on any highway driving and carries ZERO weight in the scoring formula —
// filtered out below before upsert) with no server-side aggregation, so a
// 90-day fleet-wide pull blew straight through the Edge Function's
// execution limit (repeated boot/shutdown in the function logs, no error
// response at all).
//
// Pass {"windowDays": N} in the request body for a one-off manual backfill
// of a trailing window ending now (keep N small — 2-3 days at a time —
// and run it a few times to seed history faster than waiting on the
// 15-minute schedule).
//
// Pass {"startDate": "...", "endDate": "..."} (RFC3339) instead to backfill
// an explicit HISTORICAL range not ending now -- e.g. seeding the full
// 90-day scoring window immediately from Samsara's own already-recorded
// telemetry, in ~7-day chunks, rather than waiting ~90 days of real time
// for the trailing-window cron to fill it in. Skips the fuel/energy
// section entirely in this mode: that table is a full-replace snapshot
// keyed to "now" (see its own comment below) and running it against a
// historical endDate would overwrite the current real snapshot with a
// stale one. windowDays and startDate/endDate are mutually exclusive;
// startDate/endDate wins if both are present.
//
// Driver identity: Samsara's driver.id is a different id space than
// Alvys's (plain numeric vs. "DR25...", same mismatch documented in
// samsara-hos-sync) — matched to drivers.id by exact case-insensitive
// trimmed name, same spirit as units.samsara_vehicle_id being matched by
// VIN. Unmatched Samsara drivers are stored with driver_id left null.
// Also persists each matched driver's Samsara createdAtTime, needed by
// the scoring layer's 14-day grace period.
//
// Speeding interval driver attribution: /speeding-intervals/stream only
// ever returns a vehicle (asset) id, never a driver — unlike
// safety-events and hos/violations. Approximated via each vehicle's
// staticAssignedDriver (from /fleet/vehicles, same endpoint
// samsara-fleet-mpg/samsara-miles already use) — accurate for CLG's
// typical one-driver-per-truck setup, less so for team-driven trucks.
//
// Requires SAMSARA_API secret + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";
const DEFAULT_WINDOW_DAYS = 1;
const FUEL_ENERGY_WINDOW_DAYS = 90; // matches driver_safety_scorecard's scoring window
const DRIVER_BATCH_SIZE = 25;
const VEHICLE_BATCH_SIZE = 50; // speeding-intervals/stream's documented assetIds cap

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function authHeaders() {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  return { Authorization: `Bearer ${token}` };
}

async function samsaraGet(path: string, params: Record<string, string>) {
  const url = new URL(`${SAMSARA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
}

// extractKey lets a caller pull the array out from under a nested key —
// /fleet/reports/drivers/fuel-energy is the one endpoint here whose shape
// isn't a flat `data: [...]` array; it's `data: { driverReports: [...] }`.
async function fetchAllPaginated(path: string, params: Record<string, string>, extractKey?: string) {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet(path, { ...params, ...(after ? { after } : {}) });
    const page = extractKey ? json.data?.[extractKey] : json.data;
    items.push(...(Array.isArray(page) ? page : []));
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return items;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeName(name: string | null | undefined) {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Real-data gap (2026-10-07): exact name matching alone left 13 real
// drivers unlinked even though they're the same person on both sides —
// Samsara's name differs from ours only by a suffix (Jr/Sr/II/III/IV,
// sometimes comma-separated: "Erin Williams, Sr") or a middle name/initial
// present on one side but not the other ("Gary Lee Reece" vs "Gary Reece",
// "Jack White Jr" vs "Jack R White Jr"). These two fallback tiers cover
// both. Each tier is built as a unique-key index — if two different
// drivers would collapse to the same stripped key, neither is included in
// that tier's map, so a loose match never risks attributing one driver's
// safety/HOS record to a different person.
const SUFFIX_RE = /,?\s+(jr|sr|ii|iii|iv)\.?$/i;

function stripSuffix(name: string | null | undefined) {
  return normalizeName(name).replace(SUFFIX_RE, "").trim();
}

function firstLastKey(name: string | null | undefined) {
  const parts = stripSuffix(name).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function buildUniqueIndex<T>(items: T[], keyFn: (item: T) => string | null) {
  const map = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (map.has(key)) { ambiguous.add(key); continue; }
    map.set(key, item);
  }
  for (const key of ambiguous) map.delete(key);
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // no/empty body — use the defaults below
    }

    let windowDays = DEFAULT_WINDOW_DAYS;
    let explicitRange: { start: Date; end: Date } | null = null;
    if (typeof body?.startDate === "string" && typeof body?.endDate === "string") {
      const s = new Date(body.startDate);
      const e = new Date(body.endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new Error("startDate/endDate must be valid RFC3339 timestamps");
      if (s >= e) throw new Error("startDate must be before endDate");
      explicitRange = { start: s, end: e };
    } else if (typeof body?.windowDays === "number" && body.windowDays > 0) {
      windowDays = body.windowDays;
    }

    const isBackfill = explicitRange !== null;
    const end = explicitRange?.end ?? new Date();
    const start = explicitRange?.start ?? new Date(end.getTime() - windowDays * 24 * 3600 * 1000);
    const startTime = start.toISOString();
    const endTime = end.toISOString();

    // --- Driver identity linkage (Samsara id <-> our drivers.id, by name) ---
    const samsaraDrivers = await fetchAllPaginated("/fleet/drivers", { limit: "200" });
    const samsaraNameById = new Map<string, string>(samsaraDrivers.map((d: any) => [d.id, d.name]));

    const { data: ourDrivers, error: driversErr } = await supabase.from("drivers").select("id, name");
    if (driversErr) throw driversErr;
    const ourDriverIdByName = new Map<string, string>(ourDrivers.map((d: any) => [normalizeName(d.name), d.id]));
    const ourDriverBySuffixStripped = buildUniqueIndex(ourDrivers, (d: any) => stripSuffix(d.name));
    const ourDriverByFirstLast = buildUniqueIndex(ourDrivers, (d: any) => firstLastKey(d.name));

    function resolveOurId(samsaraName: string | null | undefined): string | undefined {
      const exact = ourDriverIdByName.get(normalizeName(samsaraName));
      if (exact) return exact;
      const bySuffix = ourDriverBySuffixStripped.get(stripSuffix(samsaraName));
      if (bySuffix) return (bySuffix as any).id;
      const key = firstLastKey(samsaraName);
      const byFirstLast = key ? ourDriverByFirstLast.get(key) : undefined;
      return byFirstLast ? (byFirstLast as any).id : undefined;
    }

    const driverIdBySamsaraId = new Map<string, string>();
    const nameLinkUpdates: Promise<unknown>[] = [];
    for (const d of samsaraDrivers) {
      const ourId = resolveOurId(d.name);
      if (ourId) {
        driverIdBySamsaraId.set(d.id, ourId);
        nameLinkUpdates.push(
          supabase.from("drivers").update({
            samsara_driver_id: d.id,
            samsara_driver_created_at: d.createdAtTime ?? null,
          }).eq("id", ourId),
        );
      }
    }
    await Promise.all(nameLinkUpdates);

    // Diagnostic only (not stored) — surfaces the exact Samsara-side name
    // string for every Samsara driver that still didn't resolve to one of
    // our drivers (even after the suffix/middle-name fallback tiers), so a
    // human can tell a real new/missing driver apart from a spelling this
    // code doesn't yet account for.
    const unmatchedSamsaraDrivers = samsaraDrivers
      .filter((d: any) => !resolveOurId(d.name))
      .map((d: any) => ({ id: d.id, name: d.name }));

    // --- Vehicle linkage (Samsara vehicle id <-> units.id, already matched by VIN) ---
    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, samsara_vehicle_id").not("samsara_vehicle_id", "is", null);
    if (unitsErr) throw unitsErr;
    const unitIdByVehicleId = new Map(units.map((u: any) => [u.samsara_vehicle_id, u.id]));

    // Static assigned driver per vehicle — the only driver attribution
    // /speeding-intervals/stream's vehicle-only data allows (see header).
    const samsaraVehicles = await fetchAllPaginated("/fleet/vehicles", { limit: "200" });
    const assignedDriverIdByVehicleId = new Map<string, string>(
      samsaraVehicles
        .filter((v: any) => v.staticAssignedDriver?.id)
        .map((v: any) => [v.id, v.staticAssignedDriver.id]),
    );

    // --- Safety Events (driverIds filter is silently ignored — pull all) ---
    const safetyEvents = await fetchAllPaginated("/fleet/safety-events", { startTime, endTime, limit: "200" });
    const safetyEventRows = safetyEvents.map((e: any) => ({
      id: e.id,
      samsara_driver_id: e.driver?.id ?? null,
      driver_id: e.driver?.id ? (driverIdBySamsaraId.get(e.driver.id) ?? null) : null,
      samsara_vehicle_id: e.vehicle?.id ?? null,
      unit_id: e.vehicle?.id ? (unitIdByVehicleId.get(e.vehicle.id) ?? null) : null,
      event_time: e.time,
      max_acceleration_g: e.maxAccelerationGForce ?? null,
      coaching_state: e.coachingState ?? null,
      behavior_labels: e.behaviorLabels ?? [],
      video_url: e.downloadForwardVideoUrl ?? null,
      latitude: e.location?.latitude ?? null,
      longitude: e.location?.longitude ?? null,
      synced_at: new Date().toISOString(),
    })).filter((r: any) => r.id && r.event_time);

    let safetyEventsUpserted = 0;
    for (const batch of chunk(safetyEventRows, 500)) {
      const { error } = await supabase.from("driver_safety_events").upsert(batch, { onConflict: "id" });
      if (error) throw error;
      safetyEventsUpserted += batch.length;
    }

    // --- HOS Violations (driverIds filter works here — batch to keep query params sane) ---
    const violationRows: any[] = [];
    for (const batch of chunk(samsaraDrivers.map((d: any) => d.id), DRIVER_BATCH_SIZE)) {
      const results = await fetchAllPaginated("/fleet/hos/violations", {
        driverIds: batch.join(","), startTime, endTime, limit: "200",
      });
      for (const entry of results) {
        for (const v of entry.violations ?? []) {
          const samsaraDriverId = v.driver?.id ?? entry.driver?.id ?? null;
          if (!samsaraDriverId || !v.violationStartTime) continue;
          violationRows.push({
            id: `${samsaraDriverId}:${v.violationStartTime}:${v.type ?? ""}`,
            samsara_driver_id: samsaraDriverId,
            driver_id: driverIdBySamsaraId.get(samsaraDriverId) ?? null,
            day_start: v.day?.startTime ?? null,
            day_end: v.day?.endTime ?? null,
            violation_type: v.type ?? null,
            description: v.description ?? null,
            violation_start_time: v.violationStartTime,
            duration_ms: v.durationMs ?? null,
            synced_at: new Date().toISOString(),
          });
        }
      }
    }

    let violationsUpserted = 0;
    for (const batch of chunk(violationRows, 500)) {
      const { error } = await supabase.from("driver_hos_violations").upsert(batch, { onConflict: "id" });
      if (error) throw error;
      violationsUpserted += batch.length;
    }

    // --- Speeding Intervals (assetIds required, capped at 50 per call) ---
    const vehicleIds = units.map((u: any) => u.samsara_vehicle_id);
    const speedingRows: any[] = [];
    for (const batch of chunk(vehicleIds, VEHICLE_BATCH_SIZE)) {
      const trips = await fetchAllPaginated("/speeding-intervals/stream", {
        assetIds: batch.join(","), startTime, endTime,
      });
      for (const trip of trips) {
        const vehicleId = trip.asset?.id;
        if (!vehicleId) continue;
        for (const iv of trip.intervals ?? []) {
          // "light" severity carries zero weight in the scoring formula
          // (only moderate/heavy/severe count) and is by far the
          // dominant volume on any highway trip — skip storing it.
          if (!iv.startTime || iv.severityLevel === "light") continue;
          const assignedSamsaraDriverId = assignedDriverIdByVehicleId.get(vehicleId) ?? null;
          speedingRows.push({
            id: `${vehicleId}:${iv.startTime}`,
            samsara_vehicle_id: vehicleId,
            unit_id: unitIdByVehicleId.get(vehicleId) ?? null,
            samsara_driver_id: assignedSamsaraDriverId,
            driver_id: assignedSamsaraDriverId ? (driverIdBySamsaraId.get(assignedSamsaraDriverId) ?? null) : null,
            trip_start_time: trip.tripStartTime ?? null,
            start_time: iv.startTime,
            end_time: iv.endTime ?? null,
            severity_level: iv.severityLevel ?? null,
            posted_speed_limit_kmh: iv.postedSpeedLimitKilometersPerHour ?? null,
            max_speed_kmh: iv.maxSpeedKilometersPerHour ?? null,
            is_dismissed: iv.isDismissed ?? false,
            latitude: iv.location?.latitude ?? null,
            longitude: iv.location?.longitude ?? null,
            synced_at: new Date().toISOString(),
          });
        }
      }
    }

    let speedingUpserted = 0;
    for (const batch of chunk(speedingRows, 500)) {
      const { error } = await supabase.from("driver_speeding_intervals").upsert(batch, { onConflict: "id" });
      if (error) throw error;
      speedingUpserted += batch.length;
    }

    // --- Fuel/Energy (full-replace snapshot, like unit_hos_status — but on
    // its OWN fixed window, not windowDays. This is a pre-aggregated report
    // (one row per driver, cheap regardless of date range), unlike the raw
    // per-event endpoints above, and the scoring view (driver_safety_scorecard)
    // needs a consistent ~90-day miles-driven denominator to compare against
    // its own 90-day penalty-points window — using the same short rolling
    // windowDays here would make this table reflect only "yesterday's miles"
    // once the 15-minute schedule takes over, spuriously zeroing out active
    // drivers' scores.
    //
    // Skipped entirely in backfill mode (explicit startDate/endDate): this
    // is a full-replace snapshot always keyed to "now", not to windowDays —
    // running it against a historical endDate would delete/overwrite the
    // current real snapshot with a stale one. It already covers the full
    // 90 days on every normal run regardless, so backfilling it is both
    // unnecessary and actively harmful. ---
    let fuelEnergyUpserted: number | null = null;
    if (!isBackfill) {
      const fuelEnergyStart = new Date(end.getTime() - FUEL_ENERGY_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
      const fuelEnergyReports = await fetchAllPaginated("/fleet/reports/drivers/fuel-energy", {
        startDate: fuelEnergyStart, endDate: endTime,
      }, "driverReports");
      const fuelEnergyRows = fuelEnergyReports.map((r: any) => ({
        samsara_driver_id: r.driver?.id,
        driver_id: r.driver?.id ? (driverIdBySamsaraId.get(r.driver.id) ?? null) : null,
        period_start: fuelEnergyStart,
        period_end: endTime,
        distance_traveled_meters: r.distanceTraveledMeters ?? null,
        fuel_consumed_ml: r.fuelConsumedMl ?? null,
        efficiency_mpge: r.efficiencyMpge ?? null,
        engine_run_time_ms: r.engineRunTimeDurationMs ?? null,
        engine_idle_time_ms: r.engineIdleTimeDurationMs ?? null,
        est_carbon_emissions_kg: r.estCarbonEmissionsKg ?? null,
        est_fuel_energy_cost_usd: r.estFuelEnergyCost?.amount ?? null,
        synced_at: new Date().toISOString(),
      })).filter((r: any) => r.samsara_driver_id);

      const seenDriverIds = fuelEnergyRows.map((r: any) => r.samsara_driver_id);
      if (seenDriverIds.length > 0) {
        const { error: delErr } = await supabase.from("driver_fuel_energy").delete().not("samsara_driver_id", "in", `(${seenDriverIds.join(",")})`);
        if (delErr) throw delErr;
      }

      fuelEnergyUpserted = 0;
      for (const batch of chunk(fuelEnergyRows, 500)) {
        const { error } = await supabase.from("driver_fuel_energy").upsert(batch, { onConflict: "samsara_driver_id" });
        if (error) throw error;
        fuelEnergyUpserted += batch.length;
      }
    }

    return new Response(JSON.stringify({
      mode: isBackfill ? "backfill" : "live",
      windowStart: startTime,
      windowEnd: endTime,
      windowDays: isBackfill ? null : windowDays,
      samsaraDriversFound: samsaraDrivers.length,
      driversLinkedByName: driverIdBySamsaraId.size,
      unmatchedSamsaraDrivers,
      vehiclesWithAssignedDriver: assignedDriverIdByVehicleId.size,
      safetyEventsUpserted,
      violationsUpserted,
      speedingIntervalsUpserted: speedingUpserted,
      fuelEnergyRowsUpserted: fuelEnergyUpserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === "object" && "message" in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
