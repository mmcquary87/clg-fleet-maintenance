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
// Window: a fixed trailing 90 days, computed from now each run — matches
// the lookback the scoring formula needs (fleet-average comparisons,
// per-1000-miles rate normalizations) without needing manual date params
// on a scheduled function, same as samsara-drive-hour-utilization's
// "working days in range" concept but auto-computed rather than caller-supplied.
//
// Driver identity: Samsara's driver.id is a different id space than
// Alvys's (plain numeric vs. "DR25...", same mismatch documented in
// samsara-hos-sync) — matched to drivers.id by exact case-insensitive
// trimmed name, same spirit as units.samsara_vehicle_id being matched by
// VIN. Unmatched Samsara drivers are stored with driver_id left null.
//
// Requires SAMSARA_API secret + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";
const WINDOW_DAYS = 90;
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

async function fetchAllPaginated(path: string, params: Record<string, string>) {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet(path, { ...params, ...(after ? { after } : {}) });
    items.push(...(json.data ?? []));
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
  return (name ?? "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const end = new Date();
    const start = new Date(end.getTime() - WINDOW_DAYS * 24 * 3600 * 1000);
    const startTime = start.toISOString();
    const endTime = end.toISOString();

    // --- Driver identity linkage (Samsara id <-> our drivers.id, by name) ---
    const samsaraDrivers = await fetchAllPaginated("/fleet/drivers", { limit: "512" });
    const samsaraNameById = new Map<string, string>(samsaraDrivers.map((d: any) => [d.id, d.name]));

    const { data: ourDrivers, error: driversErr } = await supabase.from("drivers").select("id, name");
    if (driversErr) throw driversErr;
    const ourDriverIdByName = new Map<string, string>(ourDrivers.map((d: any) => [normalizeName(d.name), d.id]));

    const driverIdBySamsaraId = new Map<string, string>();
    const nameLinkUpdates: Promise<unknown>[] = [];
    for (const d of samsaraDrivers) {
      const ourId = ourDriverIdByName.get(normalizeName(d.name));
      if (ourId) {
        driverIdBySamsaraId.set(d.id, ourId);
        nameLinkUpdates.push(
          supabase.from("drivers").update({ samsara_driver_id: d.id }).eq("id", ourId),
        );
      }
    }
    await Promise.all(nameLinkUpdates);

    // --- Vehicle linkage (Samsara vehicle id <-> units.id, already matched by VIN) ---
    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, samsara_vehicle_id").not("samsara_vehicle_id", "is", null);
    if (unitsErr) throw unitsErr;
    const unitIdByVehicleId = new Map(units.map((u: any) => [u.samsara_vehicle_id, u.id]));

    // --- Safety Events (driverIds filter is silently ignored — pull all) ---
    const safetyEvents = await fetchAllPaginated("/fleet/safety-events", { startTime, endTime, limit: "512" });
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
        driverIds: batch.join(","), startTime, endTime, limit: "512",
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
          if (!iv.startTime) continue;
          speedingRows.push({
            id: `${vehicleId}:${iv.startTime}`,
            samsara_vehicle_id: vehicleId,
            unit_id: unitIdByVehicleId.get(vehicleId) ?? null,
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

    // --- Fuel/Energy (full-replace snapshot over the window, like unit_hos_status) ---
    const fuelEnergyReports = await fetchAllPaginated("/fleet/reports/drivers/fuel-energy", {
      startDate: startTime, endDate: endTime,
    });
    const fuelEnergyRows = fuelEnergyReports.map((r: any) => ({
      samsara_driver_id: r.driver?.id,
      driver_id: r.driver?.id ? (driverIdBySamsaraId.get(r.driver.id) ?? null) : null,
      period_start: startTime,
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

    let fuelEnergyUpserted = 0;
    for (const batch of chunk(fuelEnergyRows, 500)) {
      const { error } = await supabase.from("driver_fuel_energy").upsert(batch, { onConflict: "samsara_driver_id" });
      if (error) throw error;
      fuelEnergyUpserted += batch.length;
    }

    return new Response(JSON.stringify({
      windowDays: WINDOW_DAYS,
      samsaraDriversFound: samsaraDrivers.length,
      driversLinkedByName: driverIdBySamsaraId.size,
      safetyEventsUpserted,
      violationsUpserted,
      speedingIntervalsUpserted: speedingUpserted,
      fuelEnergyRowsUpserted: fuelEnergyUpserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
