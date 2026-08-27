// Fleet Maintenance System — miles driven over a date range (for cost/mile)
//
// Called live from the Spend page whenever its date filter changes — not
// part of the periodic samsara-sync. Pulls obdOdometerMeters (Samsara's
// own recommended mileage source — see developers.samsara.com/docs/
// mileage-and-distance) for every unit matched to a Samsara vehicle, takes
// the first and last reading inside the requested window, and returns the
// delta per unit + fleet total. There is no dedicated IFTA endpoint in
// Samsara's API (confirmed against their full docs) — this is the same
// odometer-delta approach their own mileage guide recommends, which is
// what IFTA mileage reporting is built from anyway.
//
// Requires SAMSARA_API secret. Runs with the caller's own auth (not
// service role) — this is a read against Samsara plus a read of our own
// units table, no writes, so the normal authenticated-user RLS is enough.

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

    const url = new URL(`${SAMSARA_BASE}/fleet/vehicles/stats/history`);
    url.searchParams.set("types", "obdOdometerMeters");
    url.searchParams.set("startTime", startTime);
    url.searchParams.set("endTime", endTime);
    url.searchParams.set("vehicleIds", vehicleIds);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`stats/history failed (${res.status}): ${text}`);
    const json = JSON.parse(text);

    const perUnit: { unitId: string; unitNumber: string; miles: number }[] = [];
    let totalMiles = 0;
    for (const v of json.data ?? []) {
      const unit = vehicleIdToUnit.get(v.id);
      if (!unit) continue;
      const readings = v.obdOdometerMeters ?? [];
      if (readings.length < 2) continue;
      const deltaMeters = readings.at(-1).value - readings[0].value;
      const miles = Math.max(0, metersToMiles(deltaMeters));
      perUnit.push({ unitId: unit.id, unitNumber: unit.number, miles: Math.round(miles) });
      totalMiles += miles;
    }

    return new Response(JSON.stringify({
      totalMiles: Math.round(totalMiles),
      perUnit,
      unitsWithSamsara: units.length,
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
