// Fleet Maintenance System — Alvys active-trip shape discovery probe
// (TEMPORARY)
//
// The Tracking page needs, for each unit currently on a load: which trip,
// which driver, and the destination's coordinates + delivery appointment
// window. alvys-trips-report and the alvys_loads sync table both only
// look at Status: ["Delivered", "Completed", "Invoiced", "Paid"] (closed
// trips) — nothing in this codebase has queried Alvys for trips that are
// still IN PROGRESS. This probe pulls a broad, unfiltered-by-status window
// of trips/search and dumps: every distinct Status value seen (so we know
// which ones mean "still moving"), whether Stops carry lat/lng, and
// whether Truck/Driver1 are populated on in-progress trips the same way
// they are on closed ones (alvys-trips-report already confirmed those
// fields exist on closed trips).
//
// Run once via this function's Test button in the Supabase dashboard and
// paste the output back so the real alvys-sync-active-trips function can
// be built against the confirmed shape. Requires ALVYS_CLIENT_ID /
// ALVYS_CLIENT_SECRET secrets. Doesn't touch our database.
//
// Delete this function once alvys-sync-active-trips is built and confirmed working.

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
    const token = await getAlvysToken();

    // A wide pickup window (30 days back to 30 days forward) with no
    // Status filter, so whatever's currently in progress shows up
    // alongside closed trips — we only need to see the distinct Status
    // values and inspect a couple of non-terminal samples, not every trip.
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();

    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        Page: 0, PageSize: 150,
        PickupDateRange: { Start: start, End: end },
      }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`trips/search returned non-JSON: ${text.slice(0, 500)}`); }
    if (!res.ok) throw new Error(`trips/search failed (${res.status}): ${text.slice(0, 500)}`);

    const items: any[] = json.Items ?? [];
    const TERMINAL_STATUSES = new Set(["Delivered", "Completed", "Invoiced", "Paid"]);
    const distinctStatuses = [...new Set(items.map((t) => t.Status))];
    const nonTerminal = items.filter((t) => !TERMINAL_STATUSES.has(t.Status));

    return new Response(JSON.stringify({
      reportedTotal: json.Total,
      fetched: items.length,
      distinctStatuses,
      nonTerminalCount: nonTerminal.length,
      // Full raw sample of up to 3 non-terminal trips — look at .Stops for
      // lat/lng field names, .Truck/.Driver1 for id shape, and whatever
      // field carries the delivery appointment window.
      sampleNonTerminalTrips: nonTerminal.slice(0, 3),
      // For comparison: one terminal (closed) trip's shape, already known-good.
      sampleTerminalTrip: items.find((t) => TERMINAL_STATUSES.has(t.Status)) ?? null,
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
