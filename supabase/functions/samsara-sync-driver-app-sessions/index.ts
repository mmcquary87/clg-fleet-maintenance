// Fleet Maintenance System — Samsara driver app sign-in tracker
//
// Snapshots /fleet/hos/clocks (every driver's current duty status; drivers signed in to a
// vehicle carry currentVehicle) into driver_app_sessions so we can tell how long a driver has
// stayed attached to a truck without working. Samsara gives no "since" timestamps, so this
// function keeps them itself, run every 15 minutes. See
// 20261123080000_driver_app_signout_flag.sql for the rules and the flag view.
//
//   attached_since  kept while the driver stays on the same vehicle; reset on a new vehicle
//   idle_since      set the first run we see the driver offDuty/sleeperBed while attached;
//                   cleared when they are driving/onDuty (or anything else that is working)
//   rows            deleted for drivers no longer attached (signed out)
//
// Read-only against Samsara. If the clocks fetch fails nothing is written or deleted, so a
// Samsara outage can't wipe the timers. Requires SAMSARA_API secret + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";
const IDLE_STATUSES = new Set(["offDuty", "sleeperBed"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function fetchAllClocks() {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const url = new URL(`${SAMSARA_BASE}/fleet/hos/clocks`);
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const nowIso = new Date().toISOString();

    const clocks = await fetchAllClocks();
    const attached = clocks.filter((c: any) => c?.driver?.id && c?.currentVehicle?.id);

    const [{ data: existing, error: exErr }, { data: ours, error: ourErr }] = await Promise.all([
      supabase.from("driver_app_sessions").select("samsara_driver_id, vehicle_id, attached_since, idle_since"),
      supabase.from("drivers").select("id, samsara_driver_id").not("samsara_driver_id", "is", null),
    ]);
    if (exErr) throw exErr;
    if (ourErr) throw ourErr;
    const prev = new Map((existing ?? []).map((r: any) => [r.samsara_driver_id, r]));
    const ourIdBySamsara = new Map((ours ?? []).map((d: any) => [String(d.samsara_driver_id), d.id]));

    const rows = attached.map((c: any) => {
      const sid = String(c.driver.id);
      const vehicleId = String(c.currentVehicle.id);
      const status = c.currentDutyStatus?.hosStatusType ?? "unknown";
      const before = prev.get(sid);
      const sameVehicle = before && before.vehicle_id === vehicleId;
      const idle = IDLE_STATUSES.has(status);
      return {
        samsara_driver_id: sid,
        driver_id: ourIdBySamsara.get(sid) ?? null,
        driver_name: String(c.driver.name ?? sid),
        vehicle_id: vehicleId,
        vehicle_name: c.currentVehicle.name ?? null,
        duty_status: status,
        attached_since: sameVehicle ? before.attached_since : nowIso,
        // Keep the running idle timer only while the driver stays idle on the same vehicle.
        idle_since: idle ? (sameVehicle && before.idle_since ? before.idle_since : nowIso) : null,
        last_seen: nowIso,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("driver_app_sessions").upsert(rows, { onConflict: "samsara_driver_id" });
      if (error) throw error;
    }

    // Drivers no longer attached have signed out: drop them so a later sign-in starts fresh.
    const stillAttached = new Set(rows.map((r) => r.samsara_driver_id));
    const gone = (existing ?? []).map((r: any) => r.samsara_driver_id).filter((id: string) => !stillAttached.has(id));
    if (gone.length > 0) {
      const { error } = await supabase.from("driver_app_sessions").delete().in("samsara_driver_id", gone);
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      driversInFeed: clocks.length,
      attached: rows.length,
      idleAttached: rows.filter((r) => r.idle_since).length,
      signedOutRemoved: gone.length,
      unlinkedToOurDrivers: rows.filter((r) => !r.driver_id).length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message
      : (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message)
      : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
