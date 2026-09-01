// Fleet Maintenance System — GPS vs. OBD odometer cross-check (TEMPORARY)
//
// Alvys trip data just reported ~341,476 mi for August 2026, within ~2% of
// Samsara's own Fleet IFTA MPG dashboard (347,972.7 mi) -- but our own two
// methods (fuel-energy report: 239,646 mi; obdOdometerMeters delta: 237,946
// mi) both land ~30% lower than BOTH of those. New leading theory: the
// obdOdometerMeters probe found 16 of ~49 Samsara-matched trucks returned
// ZERO readings for the whole month -- likely trucks without full engine/
// ECU diagnostic integration (older units, aftermarket GPS-only trackers).
// 16/49 = 33%, which lines up with the ~30% shortfall. Both
// obdOdometerMeters and the fuel-energy report likely depend on ECU/
// engine-bus data, so a truck with a GPS tracker but no ECU integration
// would report near-zero to both -- while Alvys (trip-based) and Samsara's
// dashboard (likely GPS-based) still count those miles.
//
// This probe pulls BOTH obdOdometerMeters and gpsOdometerMeters (computed
// from GPS position, no ECU required) for the same trucks/window and
// compares them side by side, to confirm/deny the coverage-gap theory
// before switching samsara-miles to a GPS-based method.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires SAMSARA_API secret + service role. Doesn't write anything.
// Delete once compared.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function metersToMiles(m: number) {
  return m * 0.000621371;
}

async function fetchAllPaginated(token: string, path: string, params: Record<string, string>) {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const url = new URL(`${SAMSARA_BASE}${path}`);
    Object.entries(after ? { ...params, after } : params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
    const json = JSON.parse(text);
    items.push(...(json.data ?? []));
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return items;
}

function deltaMilesFromSeries(rawReadings: { time: string; value: number }[]) {
  if (rawReadings.length < 2) return null;
  const readings = [...rawReadings].sort((a, b) => (a.time < b.time ? -1 : 1));
  const deltaMeters = readings.at(-1).value - readings[0].value;
  return { miles: Math.max(0, metersToMiles(deltaMeters)), readingCount: readings.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("SAMSARA_API");
    if (!token) throw new Error("SAMSARA_API secret not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Same window as the discrepancy: August 2026.
    const startTime = "2026-08-01T00:00:00Z";
    const endTime = "2026-08-31T23:59:59Z";

    const { data: trucks, error: trucksErr } = await supabase
      .from("units").select("id, number, samsara_vehicle_id").eq("type", "Truck").eq("is_active", true).not("samsara_vehicle_id", "is", null);
    if (trucksErr) throw trucksErr;
    if (trucks.length === 0) {
      return new Response(JSON.stringify({ error: "No Samsara-matched active trucks found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIdToUnit = new Map(trucks.map((u: any) => [u.samsara_vehicle_id, u]));
    const vehicleIds = trucks.map((u: any) => u.samsara_vehicle_id).join(",");

    const items = await fetchAllPaginated(token, "/fleet/vehicles/stats/history", {
      types: "obdOdometerMeters,gpsOdometerMeters",
      startTime,
      endTime,
      vehicleIds,
    });

    const obdByVehicleId = new Map<string, { time: string; value: number }[]>();
    const gpsByVehicleId = new Map<string, { time: string; value: number }[]>();
    for (const item of items) {
      if (!vehicleIdToUnit.has(item.id)) continue;
      if (item.obdOdometerMeters?.length) {
        const arr = obdByVehicleId.get(item.id) ?? [];
        arr.push(...item.obdOdometerMeters);
        obdByVehicleId.set(item.id, arr);
      }
      if (item.gpsOdometerMeters?.length) {
        const arr = gpsByVehicleId.get(item.id) ?? [];
        arr.push(...item.gpsOdometerMeters);
        gpsByVehicleId.set(item.id, arr);
      }
    }

    const perVehicle: {
      unitNumber: string;
      obdMiles: number | null;
      obdReadingCount: number;
      gpsMiles: number | null;
      gpsReadingCount: number;
    }[] = [];
    let totalObdMiles = 0;
    let totalGpsMiles = 0;
    let vehiclesMissingObdButHaveGps = 0;

    for (const [vehicleId, unit] of vehicleIdToUnit) {
      const obd = deltaMilesFromSeries(obdByVehicleId.get(vehicleId) ?? []);
      const gps = deltaMilesFromSeries(gpsByVehicleId.get(vehicleId) ?? []);
      if (obd) totalObdMiles += obd.miles;
      if (gps) totalGpsMiles += gps.miles;
      if (!obd && gps) vehiclesMissingObdButHaveGps += 1;
      perVehicle.push({
        unitNumber: unit.number,
        obdMiles: obd ? Math.round(obd.miles) : null,
        obdReadingCount: obd?.readingCount ?? 0,
        gpsMiles: gps ? Math.round(gps.miles) : null,
        gpsReadingCount: gps?.readingCount ?? 0,
      });
    }

    return new Response(JSON.stringify({
      trucksQueried: trucks.length,
      totalMilesViaObdDelta: Math.round(totalObdMiles),
      totalMilesViaGpsDelta: Math.round(totalGpsMiles),
      // Trucks with no usable obdOdometerMeters series but a usable
      // gpsOdometerMeters one -- direct evidence for/against the
      // ECU-coverage-gap theory explaining the ~30% shortfall.
      vehiclesMissingObdButHaveGps,
      // For comparison: Alvys trip data said 341,476 mi; Samsara's own
      // Fleet IFTA MPG dashboard says 347,972.7 mi; our fuel-energy report
      // (samsara-miles) said 239,646 mi; obd-only delta said 237,946 mi.
      perVehicle: perVehicle.sort((a, b) => (b.gpsMiles ?? 0) - (a.gpsMiles ?? 0)),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
