// Fleet Maintenance System — Alvys driver events shape discovery probe
// (TEMPORARY)
//
// Alvys's drivers/events/search endpoint returns recorded driver events
// (documented EventType examples: Vacation, Restart, Other) with real
// Start/EndDate + optional Address. Home Time Adherence (KPI 17, see
// home-time-adherence/index.ts) currently can only INFER "was this driver
// home" from the absence of a trip on that date -- a weak proxy, since a
// driver with no trip could be genuinely home, or just idle/in the shop/
// waiting on dispatch. A real recorded event would be a much more direct
// signal, but "Vacation, Restart, Other" isn't presented as an exhaustive
// enum, and "Restart" is a 34-hour HOS reset, not time off -- so this pulls
// real events for a handful of real drivers to see the actual EventType
// values in this account before deciding which ones should count as "home"
// for the KPI.
//
// Run once via this function's Test button in the Supabase dashboard (or
// curl with a real session/anon JWT — verify_jwt still applies, this
// function just doesn't check *who* the caller is beyond that) and paste
// the output back. Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET and the
// service role key. Delete this function once the real EventType values
// are confirmed and home-time-adherence is updated to use them.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // A handful of real, currently-active drivers is enough to see what
    // EventType values actually show up -- this isn't meant to be a
    // complete pull, just a shape/values check.
    const { data: drivers, error: driversErr } = await supabase
      .from("drivers").select("id, name").eq("is_active", true).limit(8);
    if (driversErr) throw driversErr;
    if (!drivers || drivers.length === 0) {
      return new Response(JSON.stringify({ error: "No active drivers found in our drivers table to test with" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getAlvysToken();

    // Wide window (180 days back to 180 days forward) to maximize the
    // chance of catching real events for these specific drivers.
    const now = new Date();
    const start = new Date(now.getTime() - 180 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 180 * 24 * 3600 * 1000).toISOString();

    const res = await fetch(`${ALVYS_API_BASE}/drivers/events/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        StartDate: start,
        EndDate: end,
        DriverIds: drivers.map((d) => d.id),
      }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`drivers/events/search returned non-JSON: ${text.slice(0, 500)}`); }
    if (!res.ok) throw new Error(`drivers/events/search failed (${res.status}): ${text.slice(0, 500)}`);

    const events: any[] = Array.isArray(json) ? json : (json.Items ?? json.Events ?? []);
    const distinctEventTypes = [...new Set(events.map((e) => e.EventType))];

    return new Response(JSON.stringify({
      driversQueried: drivers.map((d) => ({ id: d.id, name: d.name })),
      eventsFound: events.length,
      distinctEventTypes,
      // Full raw sample so we can see Address shape, Description content,
      // and how CreatedBy/CreatedAt look for a few real rows of each type.
      sampleEvents: events.slice(0, 15),
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
