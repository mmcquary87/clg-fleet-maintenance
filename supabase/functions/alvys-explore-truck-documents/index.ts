// Fleet Maintenance System — Alvys truck/trailer document discovery probe
// (TEMPORARY)
//
// CLG wants Annual DOT Inspection due dates sourced from Alvys's truck/
// trailer document records (the real inspection certificate's expiration
// date) rather than Samsara's generic PM schedule. Alvys's own docs
// mention "Documents retrieval" endpoints for trucks/trailers/loads/etc.
// (pattern: GET /p/v1.0/{parent}/{parentId}/documents/{documentId} to
// fetch a specific file), but the exact LIST/search shape and field names
// (document type, expiration date) aren't confirmed -- docs.alvys.com is
// unreachable from this environment's network. This tries several
// plausible endpoint shapes against one real truck and reports back
// exactly what each one returns (status + body), so the real shape can be
// read off actual API behavior instead of guessed from search-engine
// summaries.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET + service role (to pick a
// real truck's alvys_asset_id from our own units table). Doesn't write
// anything. Delete once the real shape is confirmed.

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

async function tryEndpoint(label: string, fn: () => Promise<Response>) {
  try {
    const res = await fn();
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* leave as raw text */ }
    return { label, status: res.status, ok: res.ok, body: typeof body === "string" ? body.slice(0, 1000) : body };
  } catch (err) {
    return { label, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: truck, error: truckErr } = await supabase
      .from("units").select("id, number, alvys_asset_id").eq("type", "Truck").not("alvys_asset_id", "is", null).limit(1).single();
    if (truckErr || !truck) throw new Error(`No truck with an alvys_asset_id found in our units table: ${truckErr?.message}`);

    const token = await getAlvysToken();
    const authHeaders = { Authorization: `Bearer ${token}` };
    const truckId = truck.alvys_asset_id;

    const attempts = await Promise.all([
      tryEndpoint(`GET trucks/${truckId}/documents`, () =>
        fetch(`${ALVYS_API_BASE}/trucks/${truckId}/documents`, { headers: authHeaders })),
      tryEndpoint("POST trucks/documents/search {TruckId}", () =>
        fetch(`${ALVYS_API_BASE}/trucks/documents/search`, {
          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ Page: 0, PageSize: 20, TruckId: truckId }),
        })),
      tryEndpoint("POST trucks/documents/search {AssetId}", () =>
        fetch(`${ALVYS_API_BASE}/trucks/documents/search`, {
          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ Page: 0, PageSize: 20, AssetId: truckId }),
        })),
      tryEndpoint("POST documents/search {ParentType,ParentId}", () =>
        fetch(`${ALVYS_API_BASE}/documents/search`, {
          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ Page: 0, PageSize: 20, ParentType: "Truck", ParentId: truckId }),
        })),
    ]);

    return new Response(JSON.stringify({
      testedAgainst: { ourUnitId: truck.id, unitNumber: truck.number, alvysTruckId: truckId },
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
