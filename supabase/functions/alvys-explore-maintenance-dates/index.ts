// Fleet Maintenance System — Alvys maintenance record date-field probe (TEMPORARY)
//
// Confirms exactly which date field(s) Alvys's /maintenance/search response
// carries, and which one alvys-import-maintenance SHOULD be using for
// date_opened/date_closed. That function currently uses r.CreatedAt for
// both -- confirmed via a live audit (2026-10-30) to be wrong: two known
// invoices (230017 dated 07/15/2026 on the actual paper invoice, 230324
// dated 07/31/2026) landed in work_orders with date_opened/date_closed of
// 2026-08-07 instead -- a multi-week gap consistent with CreatedAt being
// when the record was DATA-ENTERED into Alvys, not the real service date
// printed on the vendor's invoice.
//
// Dumps the full raw record for every maintenance record whose Reference
// matches one of the known invoice numbers from that audit, so the real
// service-date field (whatever it's actually called -- ServiceDate,
// MaintenanceDate, CompletedDate, InvoiceDate, something under a nested
// object, etc.) can be found with certainty instead of guessed.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets. Delete once the
// real date-field fix is wired into alvys-import-maintenance and confirmed.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 200;

// The known invoices from the 2026-10-30 audit -- all confirmed already in
// CLGOS, used here purely to find their raw Alvys records for inspection.
const TARGET_REFERENCES = ["230016", "230017", "230032", "230324", "230018", "230602"];

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

async function fetchAllMaintenance(token: string) {
  const items: any[] = [];
  let page = 0;
  const dateRange = {
    Start: new Date(Date.now() - 5 * 365 * 24 * 3600 * 1000).toISOString(),
    End: new Date().toISOString(),
  };
  while (true) {
    const res = await fetch(`${ALVYS_API_BASE}/maintenance/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, DateRange: dateRange }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`maintenance/search page ${page} failed (${res.status}): ${text}`);
    const json = JSON.parse(text);
    if (typeof json.Total !== "number" || !Array.isArray(json.Items)) {
      throw new Error(`maintenance/search page ${page} unexpected shape: ${text.slice(0, 500)}`);
    }
    items.push(...json.Items);
    if (items.length >= json.Total || json.Items.length === 0) break;
    page += 1;
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const allRecords = await fetchAllMaintenance(token);

    const matches = allRecords.filter((r: any) => TARGET_REFERENCES.includes(r.Reference));

    return new Response(JSON.stringify({
      totalMaintenanceRecordsInAlvys: allRecords.length,
      matchedCount: matches.length,
      matchedReferences: matches.map((r: any) => r.Reference),
      note: "Look across these raw records for every date-shaped field (CreatedAt, and whatever else is present) and compare each one against the real invoice date to find which field actually represents the service date.",
      rawMatches: matches,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
