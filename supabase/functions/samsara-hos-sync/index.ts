// Fleet Maintenance System — Samsara Hours of Service sync (Tracking page)
//
// Confirmed via samsara-explore-hos against real data:
//  - GET /fleet/hos/clocks returns one entry per driver in the whole
//    fleet, each with currentDutyStatus.hosStatusType and clocks.{break,
//    drive,shift,cycle}.*DurationMs (already in the units the field name
//    implies: milliseconds remaining).
//  - The vehicleIds/driverIds query params are silently ignored — a call
//    scoped to one vehicle still came back with the entire ~85-driver
//    roster. So this pulls everything every run and matches client-side,
//    same as it would have to regardless.
//  - Only entries carrying currentVehicle are attached to a truck right
//    now (most idle/off-duty drivers have no currentVehicle at all) —
//    those are matched to units by currentVehicle.id = units.samsara_vehicle_id.
//  - Samsara's driver.id here is a different id space than Alvys's (a
//    plain number like "51326727" vs. Alvys's "DR2516..."), so it can't
//    be stored in unit_hos_status.driver_id (which references our
//    drivers table, populated from Alvys) — left null here. The
//    Tracking page already gets the driver's name/identity from
//    unit_current_trip (Alvys), and joins to this table by unit_id, so
//    nothing is lost by not cross-referencing driver identity here.
//
// unit_hos_status is a full snapshot, not an append log: any unit no
// longer reporting a currentVehicle match gets its row deleted so the
// Tracking page doesn't show stale HOS clocks forever.
//
// Requires SAMSARA_API secret + service role.

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

async function fetchAllHosClocks() {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const url = new URL(`${SAMSARA_BASE}/fleet/hos/clocks`);
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: authHeaders() });
    const text = await res.text();
    if (!res.ok) throw new Error(`/fleet/hos/clocks failed (${res.status}): ${text.slice(0, 500)}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`/fleet/hos/clocks returned non-JSON: ${text.slice(0, 500)}`); }
    items.push(...(json.data ?? []));
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return items;
}

function msToMinutes(ms: number | undefined | null) {
  return typeof ms === "number" ? Math.round(ms / 60000) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const clocks = await fetchAllHosClocks();

    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, samsara_vehicle_id").not("samsara_vehicle_id", "is", null);
    if (unitsErr) throw unitsErr;
    const unitIdByVehicleId = new Map(units.map((u: any) => [u.samsara_vehicle_id, u.id]));

    const rows: any[] = [];
    let skippedNoVehicle = 0;
    for (const d of clocks) {
      const vehicleId = d.currentVehicle?.id;
      const unitId = vehicleId ? unitIdByVehicleId.get(vehicleId) : undefined;
      if (!unitId) { skippedNoVehicle += 1; continue; }

      rows.push({
        unit_id: unitId,
        driver_id: null, // see header comment — Samsara/Alvys driver ids don't share an id space
        duty_status: d.currentDutyStatus?.hosStatusType ?? null,
        drive_remaining_minutes: msToMinutes(d.clocks?.drive?.driveRemainingDurationMs),
        shift_remaining_minutes: msToMinutes(d.clocks?.shift?.shiftRemainingDurationMs),
        cycle_remaining_minutes: msToMinutes(d.clocks?.cycle?.cycleRemainingDurationMs),
        synced_at: new Date().toISOString(),
      });
    }

    const activeUnitIds = rows.map((r) => r.unit_id);
    if (activeUnitIds.length > 0) {
      const { error: delErr } = await supabase.from("unit_hos_status").delete().not("unit_id", "in", `(${activeUnitIds.join(",")})`);
      if (delErr) throw delErr;
    } else {
      const { error: delErr } = await supabase.from("unit_hos_status").delete().neq("unit_id", "00000000-0000-0000-0000-000000000000");
      if (delErr) throw delErr;
    }

    let upserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase.from("unit_hos_status").upsert(rows, { onConflict: "unit_id" });
      if (error) throw error;
      upserted = rows.length;
    }

    return new Response(JSON.stringify({
      driversFound: clocks.length,
      unitsUpserted: upserted,
      skippedNoVehicle,
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
