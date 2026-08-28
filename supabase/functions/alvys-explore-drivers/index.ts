// Fleet Maintenance System — one-off probe: does Alvys expose a drivers
// endpoint, and if so what fields does it carry?
//
// Every other Alvys resource we've found follows the same shape:
// POST /api/p/v1.0/<controller>/search with {Page, PageSize}. Trying
// "drivers/search" on that same convention — unconfirmed since Alvys's
// docs are gated, same empirical-probe pattern as alvys-explore-trips.
//
// Goal: see whether a driver record carries a real NAME (not just an
// opaque Id, which is all trips/search's Driver1 gives us) and any kind
// of employment/active status — if so, this could become the canonical
// driver list this app doesn't have yet. Delete this function once answered.
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

async function tryEndpoint(token: string, controller: string) {
  const res = await fetch(`${ALVYS_API_BASE}/${controller}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ Page: 0, PageSize: 5 }),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* leave null, raw text still reported */ }
  return { controller, status: res.status, ok: res.ok, raw: json ?? text.slice(0, 500) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    // Try a few plausible controller names since the exact one isn't documented.
    const candidates = ["drivers", "driver", "employees"];
    const results = await Promise.all(candidates.map((c) => tryEndpoint(token, c)));

    return new Response(JSON.stringify({ results }, null, 2), {
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
