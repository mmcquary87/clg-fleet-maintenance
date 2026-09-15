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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    // Pull a handful of real, currently-active trips via the endpoint we
    // already know works, so we have real trip identifiers to test the
    // check-calls endpoint against instead of guessing.
    const now = new Date();
    const start = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();
    const tripsRes = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: 0, PageSize: 20, PickupDateRange: { Start: start, End: end } }),
    });
    const tripsText = await tripsRes.text();
    let tripsJson: any;
    try { tripsJson = JSON.parse(tripsText); } catch { throw new Error(`trips/search returned non-JSON: ${tripsText.slice(0, 500)}`); }
    if (!tripsRes.ok) throw new Error(`trips/search failed (${tripsRes.status}): ${tripsText.slice(0, 500)}`);

    const trips: any[] = tripsJson.Items ?? [];
    const sample = trips.slice(0, 3);

    const attempts: Record<string, any> = {};
    for (const trip of sample) {
      const label = `TripNumber ${trip.TripNumber} (Id ${trip.Id})`;
      // Try both identifiers -- the spec's {tripId} is ambiguous between
      // Alvys's internal GUID Id and the human-readable TripNumber.
      attempts[`${label} — by Id`] = await tryGet(`trips/${trip.Id}/check-calls`, token);
      attempts[`${label} — by TripNumber`] = await tryGet(`trips/${trip.TripNumber}/check-calls`, token);
    }

    return new Response(JSON.stringify({
      tripsSampled: sample.map((t) => ({ Id: t.Id, TripNumber: t.TripNumber, LoadNumber: t.LoadNumber, Status: t.Status })),
      attempts,
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
