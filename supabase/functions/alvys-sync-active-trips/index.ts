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
//  - LoadNumber is the stable reference number to look a load up in Alvys
//    itself — TripNumber can carry a leg suffix (e.g. "1012475-1") for a
//    multi-stop load's individual legs, LoadNumber doesn't.
//  - Driver1.Id matches drivers.id directly — no separate lookup/mapping
//    needed, but still guarded against an unsynced driver id (FK would
//    reject it otherwise).
//  - The tracked stop's coordinates are Stops[].Coordinates.Latitude/
//    Longitude (strings — parseFloat them). The deadline is
//    StopWindow.End (FCFS) or AppointmentDate (APPT) — matching the same
//    isOnTime() precedence alvys-trips-report already uses. An open-ended
//    StopWindow.End (year 9999 — "no real close time") is treated as no
//    deadline rather than a literal date 8000 years out. StopWindow.Begin
//    (stop_window_start) feeds the Late Load Exposure calc's leadTimeHours
//    — null for APPT-type stops, which have no separate window.
//  - Which stop to track: the first one (in Stops[] order) without a
//    DepartedAt — still upcoming if not yet ArrivedAt, or the stop the
//    truck is currently sitting at if arrived-but-not-departed. This
//    tracks the SHIPPER/pickup stop before pickup and the CONSIGNEE/
//    delivery stop after, instead of always projecting against delivery —
//    a shipper running late is exposure too, not just a late consignee.
//  - ArrivedAt on that stop (Stops[].ArrivedAt) is the ground-truth "the
//    driver already checked in here" signal — a driver's mobile check-in,
//    independent of the trip's own Status (which stays "In Transit" until
//    the whole load is closed out, not per stop). The frontend uses this
//    to stop projecting an ETA/risk once a stop's actually been reached,
//    rather than trusting a stale Samsara GPS ping past that point.
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

// The stop to track: the first one Alvys hasn't marked departed yet. Still
// upcoming if not yet arrived, or the stop the truck is currently sitting
// at if arrived-but-not-departed. Falls back to the last stop if every
// stop already shows a departure (shouldn't happen for a trip Alvys still
// calls active, but avoids picking nothing).
function currentStopOf(stops: any[]) {
  const list = stops ?? [];
  return list.find((s: any) => !s.DepartedAt) ?? list[list.length - 1] ?? null;
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

    // A truck can carry more than one active trip record at once — e.g. a
    // currently-moving "In Transit" leg plus an already-queued "Dispatched"
    // one for its next load. unit_current_trip.unit_id is unique, and an
    // upsert can't touch the same row twice in one statement, so pick the
    // single most relevant trip per unit rather than erroring: "In Transit"
    // (actually moving right now) beats "Dispatched" (not yet picked up).
    const STATUS_PRIORITY: Record<string, number> = { "In Transit": 2, "Dispatched": 1 };
    const rowByUnitId = new Map<string, any>();
    let skippedNoTruckMatch = 0;
    for (const t of trips) {
      const truckAssetId = t.Truck?.Id;
      const unitId = truckAssetId ? unitIdByAssetId.get(truckAssetId) : undefined;
      if (!unitId) { skippedNoTruckMatch += 1; continue; }

      const existing = rowByUnitId.get(unitId);
      if (existing && (STATUS_PRIORITY[existing.status] ?? 0) >= (STATUS_PRIORITY[t.Status] ?? 0)) continue;

      const stop = currentStopOf(t.Stops);
      const driverId = t.Driver1?.Id && knownDriverIds.has(t.Driver1.Id) ? t.Driver1.Id : null;

      rowByUnitId.set(unitId, {
        unit_id: unitId,
        alvys_trip_id: t.Id,
        load_number: t.LoadNumber ?? null,
        driver_id: driverId,
        stop_type: stop?.StopType ?? null,
        stop_name: stop?.CompanyName
          ? `${stop.CompanyName} (${stop?.Address?.City ?? ""}, ${stop?.Address?.State ?? ""})`
          : stop?.Address ? `${stop.Address.City ?? ""}, ${stop.Address.State ?? ""}` : null,
        stop_lat: toNumber(stop?.Coordinates?.Latitude),
        stop_lng: toNumber(stop?.Coordinates?.Longitude),
        stop_appointment_at: stop?.AppointmentDate ?? null,
        stop_window_start: stop?.StopWindow?.Begin ?? null,
        stop_window_end: realDeadline(stop?.StopWindow?.End),
        stop_arrived_at: stop?.ArrivedAt ?? null,
        status: t.Status,
        synced_at: new Date().toISOString(),
      });
    }
    const rows = [...rowByUnitId.values()];

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
