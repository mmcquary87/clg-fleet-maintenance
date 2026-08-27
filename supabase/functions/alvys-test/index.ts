// Fleet Maintenance System — Alvys connectivity test
//
// Deno Edge Function. NOT the real sync job — this is a one-shot "can we
// reach Alvys and what does the data look like" probe, called manually
// (e.g. via the Supabase dashboard's Test button) to validate credentials
// and endpoint shapes before building the real periodic sync.
//
// Requires ALVYS_CLIENT_ID and ALVYS_CLIENT_SECRET secrets.
// Requires a valid Supabase auth JWT (default verify_jwt behavior).

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
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: "https://api.alvys.com/public/",
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alvys token request failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function alvysSearch(token: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    return { ok: false, status: res.status, error: json };
  }
  return { ok: true, status: res.status, data: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = await getAlvysToken();

    const [trucks, trailers, maintenance] = await Promise.all([
      alvysSearch(token, "trucks/search", { Page: 1, PageSize: 5, IsActive: true }),
      alvysSearch(token, "trailers/search", { Page: 1, PageSize: 5, Status: ["Active"] }),
      alvysSearch(token, "maintenance/search", {
        Page: 1,
        PageSize: 5,
        DateRange: {
          Start: new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString(),
          End: new Date().toISOString(),
        },
      }),
    ]);

    return new Response(JSON.stringify({
      tokenAcquired: true,
      trucks: { ok: trucks.ok, status: trucks.status, total: trucks.data?.Total, sample: trucks.data?.Items?.slice(0, 2), error: trucks.error },
      trailers: { ok: trailers.ok, status: trailers.status, total: trailers.data?.Total, sample: trailers.data?.Items?.slice(0, 2), error: trailers.error },
      maintenance: { ok: maintenance.ok, status: maintenance.status, total: maintenance.data?.Total, sample: maintenance.data?.Items?.slice(0, 2), error: maintenance.error },
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ tokenAcquired: false, error: String(err instanceof Error ? err.message : err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
