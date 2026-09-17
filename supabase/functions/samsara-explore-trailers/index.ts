// Fleet Maintenance System — Samsara trailer-tracking discovery probe
// (TEMPORARY)
//
// The Annual Inspection Compliance console's new "Location" column only
// ever shows trailers as blank -- samsara-sync only reads Samsara's
// /fleet/vehicles roster (powered units with an engine ECU), and CLG has
// confirmed (2026-09-17) that all trailers carry Samsara trailer-tracking
// hardware, so their location lives somewhere else in Samsara's API. This
// endpoint shape isn't confirmed -- developers.samsara.com is unreachable
// from this environment's network -- so this tries the plausible
// candidates (a dedicated /fleet/trailers object type, vs. trailers
// showing up as generic /fleet/assets) side by side rather than guessing
// and wiring one in blind.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires SAMSARA_API secret + service role (to compare against our own
// trailer VINs). Doesn't write anything. Delete once the real source is
// confirmed and wired into samsara-sync.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function authHeaders() {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  return { Authorization: `Bearer ${token}` };
}

async function tryEndpoint(label: string, path: string, params: Record<string, string>) {
  try {
    const url = new URL(`${SAMSARA_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { headers: authHeaders() });
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* leave as raw text */ }
    // Trim to a small sample -- these lists can run to 100+ items and we
    // only need to confirm shape + look for a real GPS/location reading.
    if (body && Array.isArray(body.data)) body = { ...body, data: body.data.slice(0, 5) };
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
    const { data: trailers, error: trailersErr } = await supabase
      .from("units").select("id, number, vin").eq("type", "Trailer").not("vin", "is", null).limit(5);
    if (trailersErr) throw trailersErr;

    const attempts = await Promise.all([
      tryEndpoint("GET /fleet/trailers", "/fleet/trailers", { limit: "10" }),
      tryEndpoint("GET /fleet/trailers/stats (gps)", "/fleet/trailers/stats", { types: "gps", limit: "10" }),
      tryEndpoint("GET /fleet/assets", "/fleet/assets", { limit: "10" }),
      tryEndpoint("GET /fleet/assets/stats (gps)", "/fleet/assets/stats", { types: "gps", limit: "10" }),
      // In case trailer trackers actually register under the same
      // /fleet/vehicles roster samsara-sync already reads (just not
      // VIN-matched today for some other reason) -- a cheap thing to rule
      // in or out while we're already probing.
      tryEndpoint("GET /fleet/vehicles", "/fleet/vehicles", { limit: "10" }),
    ]);

    return new Response(JSON.stringify({
      ourTrailerVinsToMatchAgainst: trailers.map((t: any) => ({ unitNumber: t.number, vin: t.vin })),
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
