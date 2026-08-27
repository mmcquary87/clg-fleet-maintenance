// Fleet Maintenance System — Alvys Loads/Trips discovery probe (TEMPORARY)
//
// Alvys's developer reference is gated behind login, so we can't read the
// Loads/Trips endpoint docs directly. This function empirically probes a
// handful of plausible controller names (following the same
// `POST {controller}/search` shape trucks/trailers/maintenance use) and
// returns which ones respond plus a sample record from each, so we can see
// real field names for loaded/empty miles and appointment vs actual
// timestamps — needed for Empty Mile %, On-Time Pickup, and On-Time
// Delivery on the Operations Dashboard.
//
// Delete this function once the real Loads/Trips integration is built —
// it's a one-time discovery tool, not part of the sync pipeline.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets (same as the
// other Alvys functions).

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

// loads/search is confirmed real (it 400s asking for a search parameter
// instead of 404ing). Try a spread of plausible Status values until one
// returns real rows, so we can see actual field names on a real load.
const STATUS_GUESSES = [
  ["Delivered"], ["Completed"], ["Booked"], ["Available"], ["Dispatched"],
  ["InTransit"], ["Assigned"], ["PickedUp"], ["Active"], ["Covered"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const results: Record<string, unknown> = {};

    // Empty-body call to loads/search reveals the FULL "must provide at
    // least one of" parameter list in its 400 response — that's how we
    // find out whether a date-range filter param exists.
    try {
      const res = await fetch(`${ALVYS_API_BASE}/loads/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: 0, PageSize: 1 }),
      });
      const text = await res.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { json = text.slice(0, 2000); }
      results["_paramDiscovery(empty body)"] = { status: res.status, body: json };
    } catch (e) {
      results["_paramDiscovery(empty body)"] = { status: "fetch_error", error: e instanceof Error ? e.message : String(e) };
    }

    for (const status of STATUS_GUESSES) {
      const key = `Status=${status[0]}`;
      try {
        const res = await fetch(`${ALVYS_API_BASE}/loads/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ Page: 0, PageSize: 1, Status: status }),
        });
        const text = await res.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { json = text.slice(0, 300); }
        results[key] = { status: res.status, body: json };
      } catch (e) {
        results[key] = { status: "fetch_error", error: e instanceof Error ? e.message : String(e) };
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
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
