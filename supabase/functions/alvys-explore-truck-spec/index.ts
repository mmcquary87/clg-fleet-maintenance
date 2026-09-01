// Fleet Maintenance System — Alvys truck spec/service-interval discovery
// probe (TEMPORARY)
//
// alvys-sync-equipment only ever mapped TruckNum/VinNumber/Id/Year/Make/
// Model/FuelType off trucks/search's response -- nobody has looked at the
// FULL raw object. Before building engine-spec-based PM interval rules (to
// replace/augment the existing manual per-unit pm_interval_days field --
// see 20260828070000_unit_maintenance_schedule.sql), this checks whether
// Alvys actually exposes an engine make/model/serial field, or any kind of
// next-service-date/interval field, on trucks or trailers.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET. Doesn't touch our database.
// Delete once the real field names are confirmed.

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

async function fetchFirstPage(token: string, path: string, extraBody: Record<string, unknown>) {
  const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ Page: 0, PageSize: 5, ...extraBody }),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const [trucksJson, trailersJson] = await Promise.all([
      fetchFirstPage(token, "trucks/search", { IsActive: true }),
      fetchFirstPage(token, "trailers/search", { Status: ["Active"] }),
    ]);

    const trucks: any[] = trucksJson.Items ?? [];
    const trailers: any[] = trailersJson.Items ?? [];

    return new Response(JSON.stringify({
      trucksTotal: trucksJson.Total,
      trailersTotal: trailersJson.Total,
      // Every distinct top-level key seen across the sample, so we know
      // what to even look for -- a raw dump alone is easy to skim past a
      // sparsely-populated field.
      truckKeysSeen: [...new Set(trucks.flatMap((t) => Object.keys(t)))],
      trailerKeysSeen: [...new Set(trailers.flatMap((t) => Object.keys(t)))],
      sampleTrucks: trucks.slice(0, 3),
      sampleTrailers: trailers.slice(0, 3),
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
