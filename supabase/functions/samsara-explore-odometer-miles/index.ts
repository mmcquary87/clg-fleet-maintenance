// Fleet Maintenance System — raw odometer-delta miles cross-check (TEMPORARY)
//
// samsara-miles (via /fleet/reports/vehicles/fuel-energy) reported
// 239,646 mi for August 2026; Samsara's own Fleet IFTA MPG dashboard shows
// 347,972.7 mi for the same month. Both leading theories for the gap are
// ruled out (confirmed live: 0 active trucks unmatched to Samsara, 0
// matched trucks missing from the fuel-energy report) -- so per CLG's
// direction, this checks a third, independent method: summing real
// obdOdometerMeters readings (first vs last inside the window) per truck
// via /fleet/vehicles/stats/history, WITH full pagination this time (the
// original version of samsara-miles used this same endpoint but never
// paginated at all -- see that function's own history/comments -- so this
// reuses the exact fetchAllPaginated pattern samsara-sync already uses
// successfully in production, not the old broken version).
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires SAMSARA_API secret + service role (reads our own units table
// directly, same as the other *-explore-* probes). Doesn't write anything.
// Delete once compared against the other two numbers.

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
      types: "obdOdometerMeters",
      startTime,
      endTime,
      vehicleIds,
    });

    // obdOdometerMeters updates ~every 30s while a truck is moving -- a
    // full month for an active truck could be thousands of readings. If
    // Samsara's pagination ever splits one vehicle's series across pages
    // (rather than only paginating across different vehicles), the same
    // vehicle id would show up as multiple separate items -- merge all
    // readings per vehicle id across every page before computing a delta,
    // rather than trusting any single item to hold the complete series.
    const readingsByVehicleId = new Map<string, { time: string; value: number }[]>();
    for (const item of items) {
      if (!vehicleIdToUnit.has(item.id)) continue;
      const arr = readingsByVehicleId.get(item.id) ?? [];
      arr.push(...(item.obdOdometerMeters ?? []));
      readingsByVehicleId.set(item.id, arr);
    }

    const perVehicle: { unitNumber: string; readingCount: number; miles: number }[] = [];
    let totalMiles = 0;
    let vehiclesWithFewerThan2Readings = 0;
    for (const [vehicleId, rawReadings] of readingsByVehicleId) {
      const unit = vehicleIdToUnit.get(vehicleId);
      const readings = [...rawReadings].sort((a, b) => (a.time < b.time ? -1 : 1));
      if (readings.length < 2) {
        vehiclesWithFewerThan2Readings += 1;
        continue;
      }
      const deltaMeters = readings.at(-1).value - readings[0].value;
      const miles = Math.max(0, metersToMiles(deltaMeters));
      perVehicle.push({ unitNumber: unit.number, readingCount: readings.length, miles: Math.round(miles) });
      totalMiles += miles;
    }

    return new Response(JSON.stringify({
      trucksQueried: trucks.length,
      vehiclesReturnedByApi: readingsByVehicleId.size,
      vehiclesWithFewerThan2Readings,
      totalMilesViaOdometerDelta: Math.round(totalMiles),
      // For comparison: samsara-miles (fuel-energy report) said 239,646 mi;
      // Samsara's own Fleet IFTA MPG dashboard says 347,972.7 mi -- this is
      // the third number.
      perVehicle: perVehicle.sort((a, b) => b.miles - a.miles),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
