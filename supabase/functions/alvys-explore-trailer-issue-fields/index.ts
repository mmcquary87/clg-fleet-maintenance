// Fleet Maintenance System — one-off probe: find where "Issue Tag" /
// "Issue Tag Note" / "Maintenance Comment" / "License Exp." live on an
// Alvys trailer record.
//
// alvys-sync-equipment already calls trailers/search and only reads a
// handful of fields off each record (Year, Make, EquipmentType, VIN,
// InspectionExpiresAt, References[]) -- these new fields are very likely
// already coming back in that same response and just never read. This
// dumps the FULL raw record for one specific trailer (34485, from CLG's
// own Alvys trailer-tracking screen) so we can see the real field names
// before deciding how to capture them.
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

async function searchTrailers(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${ALVYS_API_BASE}/trailers/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`trailers/search returned non-JSON: ${text.slice(0, 500)}`); }
  if (!res.ok) throw new Error(`trailers/search failed (${res.status}): ${text.slice(0, 500)}`);
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    // Try filtering straight to trailer 34485 -- if TrailerNum isn't a
    // valid filter key, Alvys should still return *something* (an error
    // naming the real filter, or all active trailers) rather than silently
    // ignore it, same lesson learned from trucks/search's Status vs
    // IsActive mismatch already documented in alvys-sync-equipment.
    const filtered = await searchTrailers(token, { TrailerNum: "34485", Page: 0, PageSize: 5 });

    // Fallback: pull a page of active trailers and find 34485 client-side,
    // in case the server-side filter key above is wrong.
    let fallbackMatch: any = null;
    if (!filtered.Items?.some((t: any) => String(t.TrailerNum) === "34485")) {
      const all = await searchTrailers(token, { Status: ["Active"], Page: 0, PageSize: 200 });
      fallbackMatch = (all.Items ?? []).find((t: any) => String(t.TrailerNum) === "34485") ?? null;
    }

    return new Response(JSON.stringify({
      filteredAttempt: filtered,
      fallbackMatch,
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
