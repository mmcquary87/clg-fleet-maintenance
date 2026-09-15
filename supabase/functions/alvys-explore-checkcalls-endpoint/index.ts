// Fleet Maintenance System — Alvys Check Calls endpoint confirmation probe
// (TEMPORARY)
//
// CLG's own spec draft (Check_Calls_Tracking_Spec.md, 2026-09-17) names
// the real endpoint: GET /api/p/v{version}/trips/{tripId}/check-calls --
// per-trip, not a global search. Response fields: Id, LoadNumber, TripId,
// TripNumber, Description, Activity, ResponseType, DriverName, a
// structured location (address + coordinates), SetpointTemperature/
// ReturnTemperature (reefer only), CreatedAt, CreatedBy. A write endpoint
// (POST .../check-calls) exists too but isn't being probed here -- read
// access is the open question.
//
// This directly contradicts alvys-explore-check-calls's conclusion (no
// check-call data anywhere in Alvys) -- that probe only checked
// trips/search and loads/search, which don't embed this; it lives behind
// this separate per-trip endpoint instead.
//
// The spec's own open question #1: whether our existing
// ALVYS_CLIENT_ID/SECRET (already used for loads/trips/maintenance/
// drivers search) carries the scope for this endpoint, or whether it
// needs a separately-generated, more-privileged token (Admin/Partner
// Admin role, per the spec). This probe answers that empirically: pulls
// one real active trip via the already-working trips/search, then calls
// its check-calls endpoint with the same credentials.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET. Doesn't touch our database.
// Delete once access (or the lack of it) is confirmed.

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

async function tryGet(path: string, token: string) {
  const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { status: res.status, bodySnippet: text.slice(0, 1000) };
}

// Confirmed via a first probe run: our existing credentials already have
// access (200, not 401/403), and the real identifier is Alvys's internal
// GUID Id -- TripNumber 404s. Three randomly-sampled trips all came back
// `[]`, which just means those particular trips have no calls logged, not
// that access is broken. This target trip is the one CLG's own screenshot
// showed with 15 real check-call history entries (driver Bryan Smith,
// multiple dispatchers, Sep 15-16 timestamps) -- confirming populated
// data comes back, not just an empty array, is the real remaining test.
const TARGET_TRIP_NUMBER = "1013600";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    // Wide net -- fetch enough recent trips to have a real shot at
    // including the target trip number, then filter client-side (trips/
    // search doesn't expose a documented TripNumbers filter param the way
    // loads/search exposes LoadNumbers).
    const now = new Date();
    const start = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();
    const tripsRes = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: 0, PageSize: 500, PickupDateRange: { Start: start, End: end } }),
    });
    const tripsText = await tripsRes.text();
    let tripsJson: any;
    try { tripsJson = JSON.parse(tripsText); } catch { throw new Error(`trips/search returned non-JSON: ${tripsText.slice(0, 500)}`); }
    if (!tripsRes.ok) throw new Error(`trips/search failed (${tripsRes.status}): ${tripsText.slice(0, 500)}`);

    const trips: any[] = tripsJson.Items ?? [];
    const target = trips.find((t) => t.TripNumber === TARGET_TRIP_NUMBER || t.LoadNumber === TARGET_TRIP_NUMBER);
    const sample = trips.slice(0, 3);

    const attempts: Record<string, any> = {};
    for (const trip of sample) {
      attempts[`TripNumber ${trip.TripNumber} (Id ${trip.Id})`] = await tryGet(`trips/${trip.Id}/check-calls`, token);
    }

    let targetResult: any = { found: false };
    if (target) {
      targetResult = {
        found: true,
        TripNumber: target.TripNumber,
        Id: target.Id,
        result: await tryGet(`trips/${target.Id}/check-calls`, token),
      };
    }

    return new Response(JSON.stringify({
      totalTripsSearched: trips.length,
      tripsSampled: sample.map((t) => ({ Id: t.Id, TripNumber: t.TripNumber, LoadNumber: t.LoadNumber, Status: t.Status })),
      attempts,
      targetTrip: targetResult,
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
