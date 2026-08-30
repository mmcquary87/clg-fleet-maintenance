// Fleet Maintenance System — KBX transfer-type shape discovery probe
// (TEMPORARY)
//
// CLG's on-time delivery scoring for KBX Logistics loads has a grace
// period Alvys's plain StopWindow/AppointmentDate doesn't capture: a load
// tagged "demand transfer" is due on the stated delivery date, but one
// tagged "relief transfer" gets up to 2 business days after that date
// before it counts against the scorecard. Before alvys-trips-report's
// on-time delivery calc can account for this, we need to know WHERE that
// demand/relief designation actually lives in Alvys's data.
//
// First attempt scanned trips/search (client-side, "kbx" in Stops[]
// CompanyName/CompanyNumber/References) across ~1500-2000 trips and found
// nothing — trips/search apparently doesn't carry a customer/broker name
// field at all (confirmed separately: its trip objects have no CustomerName
// anywhere). loads/search DOES expose CustomerName directly (already used
// by alvys-sync-loads/mapLoad()), so this version searches there instead —
// paginated per Status (loads/search requires one), filtered client-side
// for CustomerName containing "kbx". Doesn't touch our database.
//
// Run once via this function's Test button in the Supabase dashboard and
// paste the output back. Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET
// secrets. Delete this function once the field is found and the real fix
// is built.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES_PER_STATUS = 15; // ~2250 loads per status, generous

// Scan the terminal statuses most likely to have both demand and relief
// transfers already resolved (a relief transfer's 2-day grace only matters
// once the load has actually delivered).
const STATUSES_TO_SCAN = ["Delivered", "Completed", "Invoiced", "Paid"];

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

async function fetchLoadsForStatus(token: string, status: string) {
  const items: any[] = [];
  let page = 0;
  let reportedTotal = 0;
  while (page < MAX_PAGES_PER_STATUS) {
    const res = await fetch(`${ALVYS_API_BASE}/loads/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, Status: [status] }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`loads/search (${status}) page ${page} failed (${res.status}): ${text.slice(0, 500)}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`loads/search (${status}) page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    reportedTotal = json.Total;
    items.push(...(json.Items ?? []));
    if ((json.Items ?? []).length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return { items, reportedTotal, hitCap: page >= MAX_PAGES_PER_STATUS - 1 && items.length < reportedTotal };
}

function looksLikeKbx(l: any): boolean {
  const haystacks: string[] = [l.CustomerName ?? ""];
  for (const s of l.Stops ?? []) {
    if (s.CompanyName) haystacks.push(s.CompanyName);
    if (s.CompanyNumber) haystacks.push(s.CompanyNumber);
  }
  return haystacks.some((h) => String(h).toLowerCase().includes("kbx"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();

    const perStatus: Record<string, { reportedTotal: number; fetched: number; hitCap: boolean }> = {};
    const allLoads: any[] = [];
    for (const status of STATUSES_TO_SCAN) {
      const { items, reportedTotal, hitCap } = await fetchLoadsForStatus(token, status);
      perStatus[status] = { reportedTotal, fetched: items.length, hitCap };
      allLoads.push(...items);
    }

    const kbxLoads = allLoads.filter(looksLikeKbx);
    // Distinct CustomerName values actually seen, so we can confirm the
    // exact spelling/casing Alvys uses for KBX (or notice it isn't there).
    const distinctCustomerNames = [...new Set(allLoads.map((l) => l.CustomerName).filter(Boolean))].sort();

    return new Response(JSON.stringify({
      perStatus,
      totalLoadsScanned: allLoads.length,
      kbxLoadsFound: kbxLoads.length,
      distinctCustomerNamesSeen: distinctCustomerNames,
      // Full raw samples — look for anything naming "demand transfer" /
      // "relief transfer" / "transfer type" anywhere in here.
      sampleKbxLoads: kbxLoads.slice(0, 5),
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
