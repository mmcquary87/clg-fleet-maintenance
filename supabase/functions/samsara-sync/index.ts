// Fleet Maintenance System — Samsara sync
//
// Pulls from Samsara and updates our tables:
//   1. Vehicle roster -> matches units by VIN, sets units.samsara_vehicle_id
//   2. Fault codes (last 7 days) -> fault_events (OBD-II + J1939)
//   3. Fuel/odometer/GPS, each vehicle's latest known reading -> units
//      (current_lat/current_lng feed the Tracking page's ETA math)
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

// /fleet/vehicles/stats/history returned nothing for a vehicle whenever it
// hadn't reported a new reading inside the queried window — but the sync
// still stamped samsara_synced_at as "just synced" regardless, so a truck
// that had gone quiet for longer than the window silently kept an old
// position under a fresh-looking timestamp (confirmed: unit 3313 held a
// current_lat/lng hundreds of miles from Samsara's own live map, feeding a
// falsely inflated distance into the Tracking page's ETA math). Handles
// both possible shapes defensively (a single latest-reading object, per
// this endpoint's actual behavior, or an array, matching /stats/history)
// in case that assumption is ever wrong for a given account/fleet.
function latestOf(value: any) {
  return Array.isArray(value) ? value.at(-1) : (value ?? null);
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
    const vehicleMatchTasks: Promise<{ error: unknown }>[] = [];
    for (const v of vehicles) {
      if (!v.vin) continue;
      const unitId = unitByVin.get(v.vin.toLowerCase());
      if (unitId) {
        vehicleIdToUnitId.set(v.id, unitId);
        // .update(), not .upsert() — an upsert's attempted INSERT still has
        // to satisfy NOT NULL constraints (like units.number) on the full
        // row even when the row already exists and it'll resolve to an
        // UPDATE, since Postgres forms the insert tuple before checking
        // for a conflict. A plain update only touches the given columns.
        vehicleMatchTasks.push(supabase.from("units").update({ samsara_vehicle_id: v.id }).eq("id", unitId));
      }
    }
    const vehicleMatchResults = await Promise.all(vehicleMatchTasks);
    for (const result of vehicleMatchResults) {
      if (result && result.error) throw result.error;
    }
    const vehiclesMatched = vehicleMatchTasks.length;

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

        // OBD-II: confirmed DTCs are the real "light is on" signal;
        // pending DTCs are a softer, not-yet-confirmed warning.
        for (const dtc of reading.obdii?.diagnosticTroubleCodes ?? []) {
          const celOn = !!dtc.checkEngineLightIsOn;
          for (const code of dtc.confirmedDtcs ?? []) {
            faultRows.push({
              unit_id: unitId, dtc_code: code.dtcShortCode, dtc_description: code.dtcDescription,
              source: "obdii", samsara_reading_time: time, status: "new",
              light_severity: celOn ? "red" : "amber",
              samsara_fault_key: `${v.id}-${code.dtcShortCode}-${time}`,
            });
          }
          for (const code of dtc.pendingDtcs ?? []) {
            faultRows.push({
              unit_id: unitId, dtc_code: code.dtcShortCode, dtc_description: code.dtcDescription,
              source: "obdii", samsara_reading_time: time, status: "new", light_severity: "yellow",
              samsara_fault_key: `${v.id}-${code.dtcShortCode}-pending-${time}`,
            });
          }
        }

        // J1939: severity comes from which lamp is lit, not the DTC itself —
        // stop (red) > protect/emissions (amber) > warning-only (yellow).
        const lights = reading.j1939?.checkEngineLights ?? {};
        const j1939Severity = lights.stopIsOn ? "red"
          : (lights.protectIsOn || lights.emissionsIsOn) ? "amber"
          : lights.warningIsOn ? "yellow"
          : null;
        for (const dtc of reading.j1939?.diagnosticTroubleCodes ?? []) {
          const code = `SPN${dtc.spnId}/FMI${dtc.fmiId}`;
          faultRows.push({
            unit_id: unitId, dtc_code: code, dtc_description: `${dtc.spnDescription} — ${dtc.fmiDescription}`,
            source: "j1939", samsara_reading_time: time, status: "new", light_severity: j1939Severity,
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

    // ---- 3. Fuel / odometer / GPS, each vehicle's latest known reading ----
    // /fleet/vehicles/stats (not /stats/history) — the current-snapshot
    // endpoint, which returns each vehicle's latest known value regardless
    // of when it last reported, instead of only what fell inside a fixed
    // time window (see latestOf()'s comment for why that mattered).
    const statVehicles = await fetchAllPaginated("/fleet/vehicles/stats", {
      types: "fuelPercents,obdOdometerMeters,gps",
    });

    const syncedAt = new Date().toISOString();
    const unitUpdateTasks: Promise<{ error: unknown }>[] = [];
    for (const v of statVehicles) {
      const unitId = vehicleIdToUnitId.get(v.id);
      if (!unitId) continue;
      const fields: Record<string, unknown> = { samsara_synced_at: syncedAt };
      const lastFuel = latestOf(v.fuelPercents);
      if (lastFuel) fields.last_fuel_percent = lastFuel.value;
      const lastOdo = latestOf(v.obdOdometerMeters);
      if (lastOdo) fields.odometer = Math.round(lastOdo.value * 0.000621371); // meters -> miles
      const lastGps = latestOf(v.gps);
      if (lastGps?.address?.name) fields.current_location = lastGps.address.name;
      if (typeof lastGps?.latitude === "number") fields.current_lat = lastGps.latitude;
      if (typeof lastGps?.longitude === "number") fields.current_lng = lastGps.longitude;
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
