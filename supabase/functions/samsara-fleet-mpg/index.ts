// Fleet Maintenance System — Fleet Miles per Gallon (Operations Dashboard KPI 8)
//
// Called live from the Operations Dashboard whenever its date range changes.
// Uses Samsara's own fuel/energy report endpoint rather than deriving MPG
// from odometer + fuel-percent readings — Samsara computes per-vehicle
// distance, fuel consumed, and efficiency directly from ECM data. See
// developers.samsara.com/reference/getfuelenergyvehiclereports.
//
// Fleet-level MPG is total miles ÷ total gallons across all matched
// vehicles (the framework's formula), not an average of each vehicle's
// efficiencyMpge — averaging per-vehicle MPG would overweight low-mileage
// trucks. Per-vehicle efficiencyMpge is still returned for drill-down.
//
// Requires SAMSARA_API secret (token needs the "Read Fuel & Energy" scope).
// Runs with the caller's own auth (not service role) — read-only.

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

function mlToGallons(ml: number) {
  return ml / 3785.411784;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate (RFC 3339 date) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SAMSARA_API");
    if (!token) throw new Error("SAMSARA_API secret not set");

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
      return new Response(JSON.stringify({ fleetMpg: null, totalMiles: 0, totalGallons: 0, perVehicle: [], unitsWithSamsara: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleIdToUnit = new Map(units.map((u: any) => [u.samsara_vehicle_id, u]));
    const vehicleIds = units.map((u: any) => u.samsara_vehicle_id).join(",");

    // A vehicle can't drive real miles on ~0 recorded fuel -- that's a
    // broken fuel reading for this window, not genuine 70+ MPG. On a full
    // month this washes out in the noise; on a thin window (a single day,
    // or a short custom range) one such reading can single-handedly blow
    // up the fleet-wide ratio -- confirmed: a Sunday "This week" range
    // that resolved to just that one day produced 73.87 MPG this way.
    const MIN_MILES_TO_REQUIRE_FUEL = 10;
    const MIN_GALLONS_FOR_REAL_MILES = 1;

    let totalMiles = 0;
    let totalGallons = 0;
    let vehiclesExcludedForImplausibleFuel = 0;
    const perVehicle: { unitId: string; unitNumber: string; miles: number; gallons: number; mpg: number | null }[] = [];
    let after: string | undefined;

    while (true) {
      const url = new URL(`${SAMSARA_BASE}/fleet/reports/vehicles/fuel-energy`);
      url.searchParams.set("startDate", startDate);
      url.searchParams.set("endDate", endDate);
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
        const gallons = mlToGallons(r.fuelConsumedMl ?? 0);
        if (miles > MIN_MILES_TO_REQUIRE_FUEL && gallons < MIN_GALLONS_FOR_REAL_MILES) {
          vehiclesExcludedForImplausibleFuel += 1;
          continue;
        }
        totalMiles += miles;
        totalGallons += gallons;
        perVehicle.push({
          unitId: unit.id, unitNumber: unit.number,
          miles: Math.round(miles), gallons: Math.round(gallons * 10) / 10,
          mpg: r.efficiencyMpge ?? null,
        });
      }

      if (!json.pagination?.hasNextPage) break;
      after = json.pagination.endCursor;
    }

    return new Response(JSON.stringify({
      fleetMpg: totalGallons > 0 ? Math.round((totalMiles / totalGallons) * 100) / 100 : null,
      totalMiles: Math.round(totalMiles),
      totalGallons: Math.round(totalGallons * 10) / 10,
      perVehicle,
      unitsWithSamsara: units.length,
      vehiclesExcludedForImplausibleFuel,
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
