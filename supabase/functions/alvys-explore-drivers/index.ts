// Fleet Maintenance System — one-off probe, round 3: find the endpoint
// behind Alvys's own "driver Activity" timeline (Trip/Hometime/Other
// events, flagged when overlapping — seen in CLG's own Alvys dashboard).
//
// Round 1: drivers/search is real (400, named its fields). Round 2:
// pulled real driver records (name, license/medical dates, fleet) via
// IsActive:true — that's confirmed and already synced into our own
// `drivers` table. This round is specifically hunting for the
// Hometime/Activity feed so planned home-time can be PULLED from Alvys
// instead of re-entered by hand — trying more controller names AND (since
// drivers/search needed a specific param shape) a couple of guessed
// bodies keyed by a real driver Id, in case a flat empty-body /search
// isn't how this resource works.
//
// Delete this function once answered.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets.

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

async function getSampleDriverId(token: string): Promise<string | null> {
  const res = await fetch(`${ALVYS_API_BASE}/drivers/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ IsActive: true, Page: 0, PageSize: 1 }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.Items?.[0]?.Id ?? null;
}

async function tryEndpoint(token: string, controller: string, method: "GET" | "POST", body?: unknown) {
  const url = `${ALVYS_API_BASE}/${controller}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { url, method, status: res.status, ok: res.ok, raw: json ?? text.slice(0, 500) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const driverId = await getSampleDriverId(token);

    const attempts = await Promise.all([
      // Flat /search controllers, empty-ish body (same shape as round 1)
      tryEndpoint(token, "driverSchedule/search", "POST", { Page: 0, PageSize: 5 }),
      tryEndpoint(token, "schedule/search", "POST", { Page: 0, PageSize: 5 }),
      tryEndpoint(token, "timeline/search", "POST", { Page: 0, PageSize: 5 }),
      tryEndpoint(token, "hometimeEvents/search", "POST", { Page: 0, PageSize: 5 }),
      tryEndpoint(token, "otherEvents/search", "POST", { Page: 0, PageSize: 5 }),
      tryEndpoint(token, "driverTimeline/search", "POST", { Page: 0, PageSize: 5 }),
      // Same controllers but keyed by a real driver Id, in case they
      // require it rather than being paginated collections
      driverId ? tryEndpoint(token, "driverEvents/search", "POST", { DriverId: driverId, Page: 0, PageSize: 5 }) : null,
      driverId ? tryEndpoint(token, "activity/search", "POST", { DriverId: driverId, Page: 0, PageSize: 5 }) : null,
      // Nested-resource guesses (REST-style, not the flat /search convention)
      driverId ? tryEndpoint(token, `drivers/${driverId}`, "GET") : null,
      driverId ? tryEndpoint(token, `drivers/${driverId}/activity`, "GET") : null,
      driverId ? tryEndpoint(token, `drivers/${driverId}/events`, "GET") : null,
    ]);

    return new Response(JSON.stringify({ driverIdUsed: driverId, attempts: attempts.filter(Boolean) }, null, 2), {
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
