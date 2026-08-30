// Fleet Maintenance System — KBX transfer-type shape discovery probe
// (TEMPORARY)
//
// CLG's on-time delivery scoring for KBX Logistics loads has a grace
// period Alvys's plain StopWindow/AppointmentDate doesn't capture: a load
// tagged "demand transfer" is due on the stated delivery date, but one
// tagged "relief transfer" gets up to 2 business days after that date
// before it counts against the scorecard. Before alvys-trips-report's
// on-time delivery calc can account for this, we need to know WHERE that
// demand/relief designation actually lives in Alvys's data — a Reference,
// a custom field, something on the Stop, or the trip itself.
//
// This probe fetches a window of recent trips, filters (client-side) to
// ones that look KBX-related (Stops[].CompanyName/CompanyNumber or any
// Reference Value containing "KBX", case-insensitive — trips/search has
// no direct customer-name filter), and dumps full raw samples so we can
// find the actual field. Doesn't touch our database.
//
// Run once via this function's Test button in the Supabase dashboard and
// paste the output back. Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET
// secrets. Delete this function once the field is found and the real fix
// is built.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES = 10;

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

function looksLikeKbx(t: any): boolean {
  const haystacks: string[] = [];
  for (const s of t.Stops ?? []) {
    if (s.CompanyName) haystacks.push(s.CompanyName);
    if (s.CompanyNumber) haystacks.push(s.CompanyNumber);
    for (const r of s.References ?? []) {
      if (r.Value) haystacks.push(r.Value);
      if (r.Name) haystacks.push(r.Name);
    }
  }
  for (const r of t.References ?? []) {
    if (r.Value) haystacks.push(r.Value);
    if (r.Name) haystacks.push(r.Name);
  }
  return haystacks.some((h) => String(h).toLowerCase().includes("kbx"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    // Wide window, broad statuses — we just need real KBX trips to exist
    // somewhere in the sample, not a complete/exhaustive set.
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
    const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();

    const items: any[] = [];
    let page = 0;
    let reportedTotal = 0;
    while (page < MAX_PAGES) {
      const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, PickupDateRange: { Start: start, End: end } }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`trips/search page ${page} failed (${res.status}): ${text.slice(0, 500)}`);
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`trips/search page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
      reportedTotal = json.Total;
      items.push(...(json.Items ?? []));
      if ((json.Items ?? []).length === 0 || items.length >= json.Total) break;
      page += 1;
    }

    const kbxTrips = items.filter(looksLikeKbx);

    return new Response(JSON.stringify({
      reportedTotal,
      fetched: items.length,
      kbxTripsFound: kbxTrips.length,
      // Full raw samples — look for anything naming "demand transfer" /
      // "relief transfer" / "transfer type", in References (Name/Value),
      // on the Stop itself, or on the trip.
      sampleKbxTrips: kbxTrips.slice(0, 5),
      // If nothing matched "kbx" at all, this fleet's KBX loads might be
      // outside the 60-day pickup window, or the company name in Alvys
      // doesn't literally contain "KBX" — worth widening the search or
      // checking Alvys directly for the exact customer/company name used.
      note: kbxTrips.length === 0 ? "No KBX-looking trips found in this window — widen the date range or confirm the exact company name Alvys uses for KBX." : null,
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
