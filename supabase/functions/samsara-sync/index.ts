// Fleet Maintenance System — Samsara sync
//
// Pulls from Samsara and updates our tables:
//   1. Vehicle roster -> matches units by VIN, sets units.samsara_vehicle_id
//   2. Fault codes (last 7 days) -> fault_events (OBD-II + J1939)
//   3. Fuel/odometer/location (last 24h, latest reading per vehicle) -> units
//   4. DVIR defects (last 30 days) -> dvir_defects
//
// Read-only against Samsara — no writes back (Phase 1 scope; the design
// spec holds off on write-back/webhooks until there's monitoring in place
// for a live, ops-critical feed). Safe to re-run: fault_events dedupes on
// samsara_fault_key, dvir_defects on samsara_defect_id, units update in
// place by samsara_vehicle_id/VIN.
//
// Requires SAMSARA_API secret + service role (bulk admin operation).

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";

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
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
}

async function fetchAllPaginated(path: string, params: Record<string, string>) {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet(path, after ? { ...params, after } : params);
    items.push(...(json.data ?? []));
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return items;
}

function rfc3339(msAgo: number) {
  return new Date(Date.now() - msAgo).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- 1. Vehicle roster -> match units by VIN ----
    const vehicles = await fetchAllPaginated("/fleet/vehicles", { limit: "512" });

    const { data: units, error: unitsErr } = await supabase.from("units").select("id, vin, number");
    if (unitsErr) throw unitsErr;
    const unitByVin = new Map(units.filter((u: any) => u.vin).map((u: any) => [u.vin.toLowerCase(), u.id]));

    const vehicleIdToUnitId = new Map<string, string>();
    const vehicleMatches: { id: string; samsara_vehicle_id: string }[] = [];
    for (const v of vehicles) {
      if (!v.vin) continue;
      const unitId = unitByVin.get(v.vin.toLowerCase());
      if (unitId) {
        vehicleIdToUnitId.set(v.id, unitId);
        vehicleMatches.push({ id: unitId, samsara_vehicle_id: v.id });
      }
    }
    if (vehicleMatches.length > 0) {
      const { error } = await supabase.from("units").upsert(vehicleMatches, { onConflict: "id" });
      if (error) throw error;
    }
    const vehiclesMatched = vehicleMatches.length;

    // ---- 2. Fault codes, last 7 days ----
    const faultVehicles = await fetchAllPaginated("/fleet/vehicles/stats/history", {
      types: "faultCodes",
      startTime: rfc3339(7 * 24 * 3600 * 1000),
      endTime: rfc3339(0),
    });

    const faultRows: any[] = [];
    for (const v of faultVehicles) {
      const unitId = vehicleIdToUnitId.get(v.id);
      if (!unitId) continue;
      for (const reading of v.faultCodes ?? []) {
        const time = reading.time;
        for (const dtc of reading.obdii?.diagnosticTroubleCodes ?? []) {
          for (const code of dtc.confirmedDtcs ?? []) {
            faultRows.push({
              unit_id: unitId, dtc_code: code.dtcShortCode, dtc_description: code.dtcDescription,
              source: "obdii", samsara_reading_time: time, status: "new",
              samsara_fault_key: `${v.id}-${code.dtcShortCode}-${time}`,
            });
          }
        }
        for (const dtc of reading.j1939?.diagnosticTroubleCodes ?? []) {
          const code = `SPN${dtc.spnId}/FMI${dtc.fmiId}`;
          faultRows.push({
            unit_id: unitId, dtc_code: code, dtc_description: `${dtc.spnDescription} — ${dtc.fmiDescription}`,
            source: "j1939", samsara_reading_time: time, status: "new",
            samsara_fault_key: `${v.id}-${code}-${time}`,
          });
        }
      }
    }
    let faultsUpserted = 0;
    if (faultRows.length > 0) {
      const { error } = await supabase.from("fault_events").upsert(faultRows, { onConflict: "samsara_fault_key" });
      if (error) throw error;
      faultsUpserted = faultRows.length;
    }

    // ---- 3. Fuel / odometer / GPS, last 24h, latest reading per vehicle ----
    const statVehicles = await fetchAllPaginated("/fleet/vehicles/stats/history", {
      types: "fuelPercents,obdOdometerMeters,gps",
      startTime: rfc3339(24 * 3600 * 1000),
      endTime: rfc3339(0),
    });

    const syncedAt = new Date().toISOString();
    const unitUpdateTasks: Promise<{ error: unknown }>[] = [];
    for (const v of statVehicles) {
      const unitId = vehicleIdToUnitId.get(v.id);
      if (!unitId) continue;
      const fields: Record<string, unknown> = { samsara_synced_at: syncedAt };
      const lastFuel = v.fuelPercents?.at(-1);
      if (lastFuel) fields.last_fuel_percent = lastFuel.value;
      const lastOdo = v.obdOdometerMeters?.at(-1);
      if (lastOdo) fields.odometer = Math.round(lastOdo.value * 0.000621371); // meters -> miles
      const lastGps = v.gps?.at(-1);
      if (lastGps?.address?.name) fields.current_location = lastGps.address.name;
      // Per-row update (not a bulk upsert) so only the fields this vehicle
      // actually reported get touched — a bulk upsert across rows with
      // different key sets would null out fields missing on some rows.
      unitUpdateTasks.push(supabase.from("units").update(fields).eq("id", unitId));
    }
    const unitUpdateResults = await Promise.all(unitUpdateTasks);
    for (const result of unitUpdateResults) {
      if (result && result.error) throw result.error;
    }
    const unitsRefreshed = unitUpdateTasks.length;

    // ---- 4. DVIR defects, last 30 days ----
    const defects = await fetchAllPaginated("/fleet/defects/history", {
      startTime: rfc3339(30 * 24 * 3600 * 1000),
      endTime: rfc3339(0),
    });

    const defectRows = defects
      .filter((d: any) => vehicleIdToUnitId.has(d.vehicle?.id))
      .map((d: any) => ({
        unit_id: vehicleIdToUnitId.get(d.vehicle.id),
        defect_type: d.defectType,
        samsara_defect_id: d.id,
        is_resolved: d.isResolved,
        created_at: d.createdAtTime,
      }));
    let defectsUpserted = 0;
    if (defectRows.length > 0) {
      const { error } = await supabase.from("dvir_defects").upsert(defectRows, { onConflict: "samsara_defect_id" });
      if (error) throw error;
      defectsUpserted = defectRows.length;
    }

    return new Response(JSON.stringify({
      vehiclesFound: vehicles.length,
      vehiclesMatchedToUnits: vehiclesMatched,
      faultsUpserted,
      unitsRefreshed,
      defectsFound: defects.length,
      defectsUpserted,
      defectsSkippedUnmatchedVehicle: defects.length - defectRows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    // err can be a plain Postgrest error object ({message, details, hint,
    // code}), not an Error instance — String(obj) gives "[object Object]"
    // and hides the real message, so pull .message out explicitly first.
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === "object" && "message" in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message, raw: err }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
