// Fleet Maintenance System — miles driven over a date range (for cost/mile)
//
// Called live from the Spend page whenever its date filter changes. Uses
// Samsara's fuel/energy report endpoint -- the same one samsara-fleet-mpg
// uses for the Operations Dashboard's MPG KPI -- rather than diffing raw
// obdOdometerMeters readings. Samsara computes each vehicle's
// distanceTraveledMeters server-side for the exact requested window, so
// there's no dependency on catching a reading right at the start/end of
// the range.
//
// The original version of this function pulled obdOdometerMeters from
// /fleet/vehicles/stats/history and diffed the first vs. last reading --
// but unlike every other Samsara function in this repo (samsara-sync,
// samsara-hos-sync, samsara-drive-hour-utilization, samsara-fleet-mpg), it
// never paginated the response. Any date range or vehicle count spanning
// more than one page of readings silently truncated to the first page, so
// "last reading" wasn't anywhere near the actual end of the range --
// undercounting miles and inflating Cost/Mile well past $1/mile regardless
// of which date preset was selected. See developers.samsara.com/reference/
// getfuelenergyvehiclereports.
//
// Requires SAMSARA_API secret (token needs the "Read Fuel & Energy" scope,
// same as samsara-fleet-mpg). Runs with the caller's own auth (not service
// role) -- read-only.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startTime, endTime } = await req.json();
    if (!startTime || !endTime) {
      return new Response(JSON.stringify({ error: "startTime and endTime (ISO) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SAMSARA_API");
    if (!token) throw new Error("SAMSARA_API secret not set");

    // Use the caller's own auth for our DB read (respects RLS as normal).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, number, samsara_vehicle_id").not("samsara_vehicle_id", "is", null);
    if (unitsErr) throw unitsErr;
    if (units.length === 0) {
      return new Response(JSON.stringify({ totalMiles: 0, perUnit: [], unitsWithSamsara: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIdToUnit = new Map(units.map((u: any) => [u.samsara_vehicle_id, u]));
    const vehicleIds = units.map((u: any) => u.samsara_vehicle_id).join(",");

    const milesByUnitId = new Map<string, number>();
    let after: string | undefined;

    while (true) {
      const url = new URL(`${SAMSARA_BASE}/fleet/reports/vehicles/fuel-energy`);
      url.searchParams.set("startDate", startTime);
      url.searchParams.set("endDate", endTime);
      url.searchParams.set("vehicleIds", vehicleIds);
      url.searchParams.set("energyType", "fuel");
      if (after) url.searchParams.set("after", after);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      if (!res.ok) throw new Error(`fuel-energy report failed (${res.status}): ${text}`);
      const json = JSON.parse(text);

      for (const r of json.data?.vehicleReports ?? []) {
        const unit = vehicleIdToUnit.get(r.vehicle?.id);
        if (!unit) continue;
        const miles = metersToMiles(r.distanceTraveledMeters ?? 0);
        milesByUnitId.set(unit.id, (milesByUnitId.get(unit.id) ?? 0) + miles);
      }

      if (!json.pagination?.hasNextPage) break;
      after = json.pagination.endCursor;
    }

    const perUnit: { unitId: string; unitNumber: string; miles: number }[] = [];
    const matchedButNoData: string[] = [];
    let totalMiles = 0;
    for (const u of units) {
      const miles = milesByUnitId.get(u.id);
      if (miles == null) {
        matchedButNoData.push(u.number);
        continue;
      }
      perUnit.push({ unitId: u.id, unitNumber: u.number, miles: Math.round(miles) });
      totalMiles += miles;
    }

    return new Response(JSON.stringify({
      totalMiles: Math.round(totalMiles),
      perUnit,
      unitsWithSamsara: units.length,
      // unitsWithSamsara counts everything with a samsara_vehicle_id set --
      // matchedButNoData is the subset of those that Samsara's own report
      // never returned a vehicleReports entry for in this window at all
      // (as opposed to genuinely having 0 miles, which the report would
      // still return a row for). A high count here means the report is
      // silently dropping vehicles, not that they didn't drive.
      matchedButNoDataCount: matchedButNoData.length,
      matchedButNoDataSample: matchedButNoData.slice(0, 20),
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
