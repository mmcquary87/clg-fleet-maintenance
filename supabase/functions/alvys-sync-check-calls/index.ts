// Fleet Maintenance System — Alvys Check Calls sync
//
// Pulls real check-call history from Alvys's native Check Calls feature
// for every currently-active trip and upserts into alvys_check_calls.
// Read-only, per CLG's spec draft (Check_Calls_Tracking_Spec.md) -- never
// writes back to Alvys.
//
// Source: GET /trips/{tripId}/check-calls, where {tripId} is Alvys's
// internal GUID Id (confirmed via alvys-explore-checkcalls-endpoint --
// TripNumber 404s, Id works with our existing credentials, no separately
// -generated token needed). Not a global search -- one request per active
// trip, using the trip list alvys-sync-active-trips already keeps fresh
// in driver_active_trips (also the source of each trip's unit_id, for
// tying a check call back to a unit).
//
// Idempotent: upserts by Alvys's own Id (its natural key), so re-polling
// never duplicates. Run on a schedule (alvys_check_calls_sync_schedule.sql)
// -- every 15 minutes is the same cadence the rest of Tracking's Alvys
// data uses, and matches the spec's suggested 5-15 minute range.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";

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

function toNumber(value: unknown) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapCheckCall(raw: any, unitId: string | null) {
  const loc = raw.Location;
  const address = loc ? [loc.Street, loc.City, loc.State, loc.Zip].filter(Boolean).join(", ") || null : null;
  return {
    id: raw.Id,
    trip_id: raw.TripId,
    load_number: raw.LoadNumber ?? null,
    trip_number: raw.TripNumber ?? null,
    description: raw.Description ?? null,
    activity: raw.Activity ?? null,
    response_type: raw.ResponseType ?? null,
    driver_name: raw.DriverName ?? null,
    location_address: address,
    location_lat: toNumber(loc?.Coordinates?.Latitude),
    location_lng: toNumber(loc?.Coordinates?.Longitude),
    reefer_setpoint_temp: toNumber(raw.SetpointTemperature),
    reefer_return_temp: toNumber(raw.ReturnTemperature),
    created_at: raw.CreatedAt,
    created_by: raw.CreatedBy ?? null,
    unit_id: unitId,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getAlvysToken();

    // driver_active_trips is already kept fresh every 15 minutes by
    // alvys-sync-active-trips -- every currently Dispatched/In Transit
    // trip, independent of whether its truck matched a synced unit.
    const { data: activeTrips, error: activeErr } = await supabase
      .from("driver_active_trips").select("alvys_trip_id, unit_id");
    if (activeErr) throw activeErr;

    // A trip can appear twice (a two-driver team) -- dedupe by trip id,
    // keeping whichever row happened to carry a unit_id match if one did.
    const unitIdByTripId = new Map<string, string | null>();
    for (const t of activeTrips as any[]) {
      if (!unitIdByTripId.has(t.alvys_trip_id) || (!unitIdByTripId.get(t.alvys_trip_id) && t.unit_id)) {
        unitIdByTripId.set(t.alvys_trip_id, t.unit_id ?? null);
      }
    }
    const tripIds = [...unitIdByTripId.keys()];

    let checkCallsFound = 0;
    let upserted = 0;
    const rows: any[] = [];
    const errors: any[] = [];

    for (const tripId of tripIds) {
      const res = await fetch(`${ALVYS_API_BASE}/trips/${tripId}/check-calls`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        errors.push({ tripId, status: res.status, body: (await res.text()).slice(0, 300) });
        continue;
      }
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch {
        errors.push({ tripId, status: res.status, parseError: true, body: text.slice(0, 300) });
        continue;
      }
      const entries: any[] = Array.isArray(json) ? json : [];
      checkCallsFound += entries.length;
      for (const entry of entries) rows.push(mapCheckCall(entry, unitIdByTripId.get(tripId) ?? null));
    }

    if (rows.length > 0) {
      const { error: upsertErr } = await supabase.from("alvys_check_calls").upsert(rows, { onConflict: "id" });
      if (upsertErr) throw upsertErr;
      upserted = rows.length;
    }

    return new Response(JSON.stringify({
      activeTripsPolled: tripIds.length,
      tripsWithErrors: errors.length,
      checkCallsFound,
      upserted,
      errors,
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
