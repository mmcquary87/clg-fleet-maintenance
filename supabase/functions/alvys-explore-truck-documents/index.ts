// Fleet Maintenance System — Alvys truck/trailer document + events
// discovery probe (TEMPORARY)
//
// CLG wants Annual DOT Inspection due dates sourced from Alvys instead of
// Samsara's generic PM schedule. Two candidate sources:
//
// 1. Truck/trailer "documents" -- Alvys's docs mention a documents-
//    retrieval pattern (GET /p/v1.0/{parent}/{parentId}/documents/
//    {documentId} to fetch one known file), but the exact LIST/search
//    shape and field names (document type, expiration date) aren't
//    confirmed -- docs.alvys.com is unreachable from this environment's
//    network, so this tries several plausible shapes.
//
// 2. trucks/events/search and trailers/events/search -- fully confirmed
//    request/response shape (StartDate/EndDate/TruckIds|TrailerIds in,
//    Id/TruckId|TrailerId/Title/EventType/Description/StartDate/EndDate/
//    Address/CreatedBy/CreatedAt out). Docs describe EventType examples as
//    "Repair, Other" -- generic, but the analogous drivers/events/search
//    endpoint turned out to encode real business meaning (Hometime/
//    Restart/Vacation/SickOrEmergency) behind an equally generic
//    description, so an inspection completion may show up here as a real
//    EventType worth checking directly rather than assuming.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET + service role (to pick a
// real truck/trailer's alvys_asset_id from our own units table). Doesn't
// write anything. Delete once the real source is confirmed.

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
    const { data: trailer, error: trailerErr } = await supabase
      .from("units").select("id, number, alvys_asset_id").eq("type", "Trailer").not("alvys_asset_id", "is", null).limit(1).single();
    if (trailerErr || !trailer) throw new Error(`No trailer with an alvys_asset_id found in our units table: ${trailerErr?.message}`);

    const token = await getAlvysToken();
    const authHeaders = { Authorization: `Bearer ${token}` };
    const truckId = truck.alvys_asset_id;
    const trailerId = trailer.alvys_asset_id;

    // Wide window (2 years back to 1 year forward) to maximize the chance
    // of catching a real inspection-related event for these specific assets.
    const now = new Date();
    const start = new Date(now.getTime() - 730 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

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
      // Confirmed shape -- see docs.alvys.com's own reference page for
      // POST trucks/events/search / trailers/events/search.
      tryEndpoint("POST trucks/events/search (confirmed shape)", () =>
        fetch(`${ALVYS_API_BASE}/trucks/events/search`, {
          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ StartDate: start, EndDate: end, TruckIds: [truckId] }),
        })),
      tryEndpoint("POST trailers/events/search (confirmed shape)", () =>
        fetch(`${ALVYS_API_BASE}/trailers/events/search`, {
          method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ StartDate: start, EndDate: end, TrailerIds: [trailerId] }),
        })),
    ]);

    return new Response(JSON.stringify({
      testedAgainst: {
        truck: { ourUnitId: truck.id, unitNumber: truck.number, alvysTruckId: truckId },
        trailer: { ourUnitId: trailer.id, unitNumber: trailer.number, alvysTrailerId: trailerId },
      },
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
