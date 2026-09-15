// Fleet Maintenance System — Alvys check-call field discovery probe
// (TEMPORARY)
//
// CLG (2026-09-15) wants the new hourly check-call board built against a
// real Alvys endpoint/field if one exists, rather than assumed to be
// fully manual entry. alvys-explore-active-trips already dumped a
// non-terminal trip's full raw shape once (for the Tracking page's
// GPS/ETA rebuild) but nobody scanned it specifically for a call-log /
// driver-communication field — this probe re-fetches in-progress trips
// and loads and scans both for anything resembling a check-call: a
// dispatcher note, a status-update timestamp, a "last contacted" field,
// or a nested log/history array.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET. Doesn't touch our database.
// Delete once the real field names (or their absence) are confirmed.

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

// Broad net -- a check-call field could be named almost anything depending
// on Alvys's internal vocabulary, so scan for every plausible synonym
// rather than guessing one.
const KEYWORDS = [
  "checkcall", "check call", "check-call", "callin", "call in", "call log",
  "callhistory", "call history", "dispatchnote", "dispatch note",
  "statusupdate", "status update", "lastcontact", "last contact",
  "communication", "comment", "note", "tracking update", "trackingupdate",
  "history", "log", "eta update",
];

function scanForKeywords(obj: unknown) {
  const json = JSON.stringify(obj);
  const lower = json.toLowerCase();
  const hits: Record<string, string[]> = {};
  for (const kw of KEYWORDS) {
    const idx = lower.indexOf(kw);
    if (idx === -1) continue;
    hits[kw] = [json.slice(Math.max(0, idx - 60), idx + 140)];
  }
  return hits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    const now = new Date();
    const start = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();

    const [tripsRes, loadsRes] = await Promise.all([
      fetch(`${ALVYS_API_BASE}/trips/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: 0, PageSize: 150, PickupDateRange: { Start: start, End: end } }),
      }),
      fetch(`${ALVYS_API_BASE}/loads/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: 0, PageSize: 50, Status: ["InTransit", "Dispatched", "AtPickup", "AtDelivery"] }),
      }),
    ]);

    const tripsText = await tripsRes.text();
    let tripsJson: any;
    try { tripsJson = JSON.parse(tripsText); } catch { throw new Error(`trips/search returned non-JSON: ${tripsText.slice(0, 500)}`); }
    if (!tripsRes.ok) throw new Error(`trips/search failed (${tripsRes.status}): ${tripsText.slice(0, 500)}`);

    const loadsText = await loadsRes.text();
    let loadsJson: any;
    try { loadsJson = JSON.parse(loadsText); } catch { throw new Error(`loads/search returned non-JSON: ${loadsText.slice(0, 500)}`); }
    // loads/search may reject an unrecognized Status enum value -- if so,
    // fall back to an unfiltered pull so this probe still returns useful
    // trip-side data instead of erroring out entirely.
    let loadsFallbackNote: string | null = null;
    let loads: any[] = loadsJson.Items ?? [];
    if (!loadsRes.ok) {
      loadsFallbackNote = `loads/search with Status filter failed (${loadsRes.status}): ${loadsText.slice(0, 300)} — retrying unfiltered`;
      const retryRes = await fetch(`${ALVYS_API_BASE}/loads/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: 0, PageSize: 50 }),
      });
      const retryText = await retryRes.text();
      const retryJson = JSON.parse(retryText);
      loads = retryJson.Items ?? [];
    }

    const trips: any[] = tripsJson.Items ?? [];
    const TERMINAL_STATUSES = new Set(["Delivered", "Completed", "Invoiced", "Paid"]);
    const nonTerminalTrips = trips.filter((t) => !TERMINAL_STATUSES.has(t.Status));

    const allTripKeys = [...new Set(trips.flatMap((t) => Object.keys(t)))];
    const allLoadKeys = [...new Set(loads.flatMap((l) => Object.keys(l)))];
    const allStopKeys = [...new Set(trips.flatMap((t) => (Array.isArray(t.Stops) ? t.Stops.flatMap((s: any) => Object.keys(s)) : [])))];

    return new Response(JSON.stringify({
      tripsFetched: trips.length,
      nonTerminalTripsFound: nonTerminalTrips.length,
      loadsFetched: loads.length,
      loadsFallbackNote,
      allTopLevelTripKeys: allTripKeys,
      allTopLevelLoadKeys: allLoadKeys,
      allStopKeysSeenAcrossTrips: allStopKeys,
      // Keyword scan across the full stringified objects, not just
      // top-level keys -- a call log is most likely nested (e.g. a
      // Stops[].History array or a Notes collection on the load).
      keywordHitsInTrips: scanForKeywords(nonTerminalTrips.length > 0 ? nonTerminalTrips : trips),
      keywordHitsInLoads: scanForKeywords(loads),
      sampleNonTerminalTrip: nonTerminalTrips[0] ?? trips[0] ?? null,
      sampleLoad: loads[0] ?? null,
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
