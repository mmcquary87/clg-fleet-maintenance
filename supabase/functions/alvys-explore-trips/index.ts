// Fleet Maintenance System — Alvys PickupDateRange/DeliveryDateRange
// shape discovery probe (TEMPORARY)
//
// trips/search accepts a "PickupDateRange" / "DeliveryDateRange" search
// param (confirmed by its 400 response), but the {Begin, End} shape used
// elsewhere in this API (StopWindow) turned out to be silently ignored —
// Alvys's JSON binding drops unrecognized sub-fields instead of erroring,
// so a wrong shape looks like success (200, real data) but just returns
// the unfiltered full set.
//
// This probe tries several plausible shapes against a date window picked
// to return ZERO real trips (year 2000) — whichever shape actually
// filters will report Total: 0; any shape being silently ignored will
// report the full unfiltered total instead (a large number).
//
// Delete once the real shape is confirmed and alvys-trips-report is
// fixed. Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets.

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

const REAL_END = "2026-08-27";
const FUTURE = "2030-01-01";

// "End" is now CONFIRMED as the real upper-bound field name (deadzone
// test zeroed out only when End was set to year 2000; switching to
// To/EndDate broke filtering entirely — full unfiltered set came back).
// "Begin" is CONFIRMED ignored (Begin=2030 with End=Aug27 still returned
// the full unfiltered total instead of 0). So: find the real lower-bound
// field name by pairing each candidate with the confirmed-working "End"
// and an impossible-future value — the correct name will zero out the
// result (nothing can be >= 2030); a wrong name leaves it unfiltered
// (~13231, matching End=Aug27 alone).
const LOWER_BOUND_CANDIDATES = [
  "Start", "From", "Min", "After", "Since", "GreaterThan",
  "GreaterThanOrEqual", "Gte", "NotBefore", "Floor", "Lower", "Low",
];

const SHAPE_CANDIDATES: Record<string, unknown> = {};
for (const name of LOWER_BOUND_CANDIDATES) {
  SHAPE_CANDIDATES[`${name}=2030_End=Aug27`] = { [name]: FUTURE, End: REAL_END };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const results: Record<string, unknown> = {};

    for (const [label, value] of Object.entries(SHAPE_CANDIDATES)) {
      try {
        const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            Page: 0, PageSize: 1,
            Status: ["Delivered", "Completed", "Invoiced", "Paid"],
            PickupDateRange: value,
          }),
        });
        const text = await res.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { json = text.slice(0, 500); }
        // Only surface Total + status — full Items would be noisy across 8 candidates.
        const total = (json as any)?.Total;
        results[label] = { status: res.status, total, filtered: total === 0, raw: total === undefined ? json : undefined };
      } catch (e) {
        results[label] = { status: "fetch_error", error: e instanceof Error ? e.message : String(e) };
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
