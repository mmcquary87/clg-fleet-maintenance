// Fleet Maintenance System — Samsara vehicle static-assignment audit (TEMPORARY)
//
// driver_safety_scorecard's Speeding category can only attribute a
// /speeding-intervals/stream interval to a driver via that vehicle's
// staticAssignedDriver (set in Samsara, /fleet/vehicles) -- that endpoint
// never returns a driver id of its own (see
// samsara-sync-driver-safety/index.ts's header). A live cross-reference
// (2026-10-28) found 14 of 33 active drivers with real Safety/HOS activity
// and mileage but ZERO speeding rows ever -- the same fingerprint a missing
// or wrong static assignment produces, since Safety/HOS attribute off the
// event's own driver field and aren't affected by this gap at all.
//
// This is a read-only report, not a sync -- it changes nothing in Samsara
// or in our own tables. Run it once via this function's Test button in the
// Supabase dashboard and read the JSON back; it answers two questions
// Safety/Ops need before touching Samsara's fleet settings:
//   1. driversWithNoVehicleAssigned -- active CLG drivers whose
//      samsara_driver_id is never any vehicle's staticAssignedDriver right
//      now. These are a structural dead zone for Speeding scoring until a
//      truck is assigned to them in Samsara.
//   2. vehiclesWithNoDriverAssigned -- vehicles with no staticAssignedDriver
//      at all, by our own unit number where matched, so whoever maintains
//      Samsara's fleet settings has a concrete punch list.
//
// Requires SAMSARA_API secret + service role.
// Delete this function once the Samsara-side assignments are cleaned up and
// re-verified (re-run it after that cleanup to confirm the gap closed).

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
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
}

async function fetchAllPaginated(path: string, params: Record<string, string>) {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet(path, { ...params, ...(after ? { after } : {}) });
    items.push(...(Array.isArray(json.data) ? json.data : []));
    if (!json.pagination?.hasNextPage) break;
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

    const [vehicles, unitsRes, driversRes] = await Promise.all([
      fetchAllPaginated("/fleet/vehicles", { limit: "200" }),
      supabase.from("units").select("number, samsara_vehicle_id").not("samsara_vehicle_id", "is", null),
      supabase.from("drivers").select("id, name, samsara_driver_id, is_active").not("samsara_driver_id", "is", null),
    ]);
    if (unitsRes.error) throw unitsRes.error;
    if (driversRes.error) throw driversRes.error;

    // Confirmed real failure (2026-10-28, multiple units): a unit whose
    // samsara_vehicle_id no longer resolves to a live Samsara vehicle (sold/
    // decommissioned/device swapped) 404s samsara-sync-driver-safety's whole
    // /speeding-intervals/stream batch for every vehicle in it. That sync is
    // now resilient to this (catches per-batch), but the stale id itself
    // still needs fixing on our side -- this is the punch list.
    const liveVehicleIds = new Set(vehicles.map((v: any) => v.id));
    const unitsWithStaleVehicleId = unitsRes.data
      .filter((u: any) => !liveVehicleIds.has(u.samsara_vehicle_id))
      .map((u: any) => ({ unitNumber: u.number, staleSamsaraVehicleId: u.samsara_vehicle_id }));

    const unitNumberByVehicleId = new Map(unitsRes.data.map((u: any) => [u.samsara_vehicle_id, u.number]));
    const driverNameBySamsaraId = new Map(driversRes.data.map((d: any) => [d.samsara_driver_id, d.name]));
    const assignedSamsaraDriverIds = new Set(
      vehicles.filter((v: any) => v.staticAssignedDriver?.id).map((v: any) => v.staticAssignedDriver.id),
    );

    const vehiclesWithNoDriverAssigned = vehicles
      .filter((v: any) => !v.staticAssignedDriver?.id)
      .map((v: any) => ({
        samsaraVehicleId: v.id,
        samsaraVehicleName: v.name ?? null,
        ourUnitNumber: unitNumberByVehicleId.get(v.id) ?? null,
      }));

    const vehiclesWithUnmatchedDriver = vehicles
      .filter((v: any) => v.staticAssignedDriver?.id && !driverNameBySamsaraId.has(v.staticAssignedDriver.id))
      .map((v: any) => ({
        samsaraVehicleId: v.id,
        samsaraVehicleName: v.name ?? null,
        ourUnitNumber: unitNumberByVehicleId.get(v.id) ?? null,
        samsaraAssignedDriverId: v.staticAssignedDriver.id,
        samsaraAssignedDriverName: v.staticAssignedDriver.name ?? null,
      }));

    const driversWithNoVehicleAssigned = driversRes.data
      .filter((d: any) => d.is_active && !assignedSamsaraDriverIds.has(d.samsara_driver_id))
      .map((d: any) => ({ driverId: d.id, name: d.name, samsaraDriverId: d.samsara_driver_id }));

    return new Response(JSON.stringify({
      summary: {
        totalVehicles: vehicles.length,
        vehiclesWithDriverAssigned: vehicles.length - vehiclesWithNoDriverAssigned.length,
        vehiclesWithNoDriverAssigned: vehiclesWithNoDriverAssigned.length,
        activeDriversLinkedToSamsara: driversRes.data.filter((d: any) => d.is_active).length,
        activeDriversWithNoVehicleAssigned: driversWithNoVehicleAssigned.length,
        unitsWithStaleVehicleId: unitsWithStaleVehicleId.length,
      },
      unitsWithStaleVehicleId,
      driversWithNoVehicleAssigned,
      vehiclesWithNoDriverAssigned,
      vehiclesWithUnmatchedDriver,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
