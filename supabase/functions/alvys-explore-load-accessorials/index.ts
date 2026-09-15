// Fleet Maintenance System — Alvys load accessorial/line-item discovery
// probe (TEMPORARY)
//
// SC-02 (Detention Identification and Submission Timeliness) currently
// looks blocked on a manual review workflow CLG would have to stand up.
// But CLG (2026-09-15) pointed out that Detention/Layover/TONU are
// customer-billed line items at the LOAD level in Alvys, not just a
// derived dwell-time computation like this app's own KPI 16. If Alvys
// exposes those as real accessorial line items with a created/submitted
// date, that could BE the "was this detention identified and billed"
// signal SC-02 needs -- no manual "mark submitted" step required.
//
// alvys-sync-loads already reads `l.Linehaul?.Amount` and
// `l.CustomerRate?.Amount` off loads/search, meaning a load's rate is
// broken into components -- Detention/Layover/TONU are likely siblings of
// Linehaul in that same rate object, never dumped in full before. This
// probe fetches a handful of real Delivered loads and dumps the complete
// raw object (not just the fields alvys-sync-loads currently maps) so we
// can see the real accessorial field names, if any.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const res = await fetch(`${ALVYS_API_BASE}/loads/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: 0, PageSize: 10, Status: ["Delivered"] }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`loads/search returned non-JSON: ${text.slice(0, 500)}`); }
    if (!res.ok) throw new Error(`loads/search failed (${res.status}): ${text.slice(0, 500)}`);

    const loads: any[] = json.Items ?? [];
    const allKeys = [...new Set(loads.flatMap((l) => Object.keys(l)))];
    // Keyword scan across the FULL stringified object, not just top-level
    // keys -- an accessorial breakdown is likely nested inside a rate
    // object (e.g. CustomerRate.LineItems, CustomerRate.Accessorials), so
    // a top-level-only key scan would miss it entirely.
    const keywordHits = ["detention", "layover", "tonu", "accessorial", "lineitem", "line item", "charge"];
    const matchedSnippets: Record<string, string[]> = {};
    for (const l of loads) {
      const json = JSON.stringify(l);
      for (const kw of keywordHits) {
        const idx = json.toLowerCase().indexOf(kw);
        if (idx === -1) continue;
        (matchedSnippets[kw] ??= []).push(json.slice(Math.max(0, idx - 60), idx + 120));
      }
    }

    return new Response(JSON.stringify({
      total: json.Total,
      loadsReturned: loads.length,
      allTopLevelKeysSeen: allKeys,
      rateRelatedKeysSeen: allKeys.filter((k) => /rate|charge|line|accessorial|amount/i.test(k)),
      keywordSnippetsFound: matchedSnippets,
      sampleLoads: loads.slice(0, 3),
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
