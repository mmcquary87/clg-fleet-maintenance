// Fleet Maintenance System — Alvys active-trip sync (Tracking page)
//
// Confirmed via alvys-explore-active-trips against real data:
//  - trips/search's Status filter works server-side (already used for
//    closed trips elsewhere) — "Dispatched" and "In Transit" are the two
//    statuses meaning "assigned to a truck and not yet delivered".
//    "Open" trips have no Truck/Driver1 yet (unassigned, nothing to
//    track); "Completed"/"Delivered"/"Released"/"Cancelled" are terminal.
//  - Truck.Id matches units.alvys_asset_id (same id space alvys-sync-
//    equipment already populates units with).
//  - Driver1.Id matches drivers.id directly — no separate lookup/mapping
//    needed, but still guarded against an unsynced driver id (FK would
//    reject it otherwise).
//  - The delivery stop's coordinates are Stops[].Coordinates.Latitude/
//    Longitude (strings — parseFloat them). The deadline is
//    StopWindow.End (FCFS) or AppointmentDate (APPT) — matching the same
//    isOnTime() precedence alvys-trips-report already uses. An open-ended
//    StopWindow.End (year 9999 — "no real close time") is treated as no
//    deadline rather than a literal date 8000 years out.
//
// unit_current_trip is a full snapshot, not an append log: any unit no
// longer on an active trip gets its row deleted so the Tracking page
// doesn't show a stale destination forever.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES = 20;
const ACTIVE_STATUSES = ["Dispatched", "In Transit"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getAlvysToken(): Promise<string> {
  const clientId = Deno.env.get("ALVYS_CLIENT_ID");
  const clientSecret = Deno.env.get("ALVYS_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET not set");
  const res = await fetch(ALVYS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, audience: "https://api.alvys.com/public/", grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Alvys token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchActiveTrips(token: string, start: string, end: string) {
  const items: any[] = [];
  let page = 0;
  while (page < MAX_PAGES) {
    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        Page: page, PageSize: PAGE_SIZE,
        Status: ACTIVE_STATUSES,
        PickupDateRange: { Start: start, End: end },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`trips/search page ${page} failed (${res.status}): ${text.slice(0, 500)}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`trips/search page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    items.push(...(json.Items ?? []));
    if ((json.Items ?? []).length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return items;
}

function lastDeliveryStop(stops: any[]) {
  const deliveries = (stops ?? []).filter((s: any) => s.StopType === "Delivery");
  return deliveries[deliveries.length - 1] ?? null;
}

// StopWindow.End of "9999-12-31..." means "no real close time", not a
// literal 8000-years-out deadline — same convention as an open pickup
// window in the sample data.
function realDeadline(value: string | undefined | null) {
  if (!value) return null;
  return value.startsWith("9999") ? null : value;
}

function toNumber(value: string | undefined | null) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getAlvysToken();

    // Wide pickup window: catches loads already in transit (picked up in
    // the past, not yet delivered) as well as freshly dispatched ones
    // whose pickup hasn't happened yet.
    const now = new Date();
    const start = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();
    const trips = await fetchActiveTrips(token, start, end);

    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, alvys_asset_id").not("alvys_asset_id", "is", null);
    if (unitsErr) throw unitsErr;
    const unitIdByAssetId = new Map(units.map((u: any) => [u.alvys_asset_id, u.id]));

    const { data: drivers, error: driversErr } = await supabase.from("drivers").select("id");
    if (driversErr) throw driversErr;
    const knownDriverIds = new Set(drivers.map((d: any) => d.id));

    const rows: any[] = [];
    let skippedNoTruckMatch = 0;
    for (const t of trips) {
      const truckAssetId = t.Truck?.Id;
      const unitId = truckAssetId ? unitIdByAssetId.get(truckAssetId) : undefined;
      if (!unitId) { skippedNoTruckMatch += 1; continue; }

      const delivery = lastDeliveryStop(t.Stops);
      const driverId = t.Driver1?.Id && knownDriverIds.has(t.Driver1.Id) ? t.Driver1.Id : null;

      rows.push({
        unit_id: unitId,
        alvys_trip_id: t.Id,
        driver_id: driverId,
        destination_name: delivery?.CompanyName
          ? `${delivery.CompanyName} (${delivery?.Address?.City ?? ""}, ${delivery?.Address?.State ?? ""})`
          : delivery?.Address ? `${delivery.Address.City ?? ""}, ${delivery.Address.State ?? ""}` : null,
        destination_lat: toNumber(delivery?.Coordinates?.Latitude),
        destination_lng: toNumber(delivery?.Coordinates?.Longitude),
        delivery_appointment_at: delivery?.AppointmentDate ?? null,
        delivery_window_end: realDeadline(delivery?.StopWindow?.End),
        status: t.Status,
        synced_at: new Date().toISOString(),
      });
    }

    // Full snapshot: drop any unit's row that isn't in this run's active
    // set (its trip delivered/cancelled since the last sync), then upsert
    // what's actually active now.
    const activeUnitIds = rows.map((r) => r.unit_id);
    if (activeUnitIds.length > 0) {
      const { error: delErr } = await supabase.from("unit_current_trip").delete().not("unit_id", "in", `(${activeUnitIds.join(",")})`);
      if (delErr) throw delErr;
    } else {
      const { error: delErr } = await supabase.from("unit_current_trip").delete().neq("unit_id", "00000000-0000-0000-0000-000000000000");
      if (delErr) throw delErr;
    }

    let upserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase.from("unit_current_trip").upsert(rows, { onConflict: "unit_id" });
      if (error) throw error;
      upserted = rows.length;
    }

    return new Response(JSON.stringify({
      tripsFound: trips.length,
      unitsUpserted: upserted,
      skippedNoTruckMatch,
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
