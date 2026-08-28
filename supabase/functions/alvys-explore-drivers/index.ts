// Fleet Maintenance System — one-off probe: what does a real Alvys driver
// record look like?
//
// Round 1 confirmed "drivers/search" is a real endpoint (400, not 404) and
// its validation error named the driver's searchable fields: Name, Status,
// IsActive, FleetName, EmployeeId — meaning Alvys's public API does carry
// a real driver name, not just the opaque Driver1.Id trips/search gives
// us. This round passes IsActive:true (a guess at the required shape,
// same empirical pattern as everything else in this Alvys integration)
// to actually pull driver records and see the full field set. Delete this
// function once answered.
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

async function tryBody(token: string, label: string, body: unknown) {
  const res = await fetch(`${ALVYS_API_BASE}/drivers/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* leave null, raw text still reported */ }
  return { label, status: res.status, ok: res.ok, raw: json ?? text.slice(0, 800) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    // A few plausible shapes for "at least one search parameter" —
    // trying the simplest first.
    const attempts = await Promise.all([
      tryBody(token, "IsActive:true + paging", { IsActive: true, Page: 0, PageSize: 10 }),
      tryBody(token, "Status array + paging", { Status: ["Active"], Page: 0, PageSize: 10 }),
      tryBody(token, "IsActive:true only", { IsActive: true }),
    ]);

    return new Response(JSON.stringify({ attempts }, null, 2), {
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
