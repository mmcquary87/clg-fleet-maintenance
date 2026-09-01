// Fleet Maintenance System — Samsara IFTA report discovery probe (TEMPORARY)
//
// Company Spend's Cost/Mile figure (via samsara-miles, using /fleet/
// reports/vehicles/fuel-energy's distanceTraveledMeters) showed 239,974 mi
// for August 2026, but Samsara's own "Fleet IFTA MPG" report in the
// dashboard shows 347,972.7 mi for the same month -- a ~31% gap. Samsara
// has dedicated IFTA endpoints (per Samsara's docs, unreachable from this
// environment's network so unconfirmed field-by-field):
//   GET /fleet/reports/ifta/jurisdiction -- fleet totals per state/period
//   GET /fleet/reports/ifta/vehicle      -- per-vehicle breakdown by state
// which are likely the real source behind that dashboard number, distinct
// from the generic fuel-energy report. Requires the SAMSARA_API token to
// have "Read IFTA (US)" under the Compliance permission category -- if
// this 403s, that scope is probably missing.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Delete once the real shape/numbers are confirmed.

const SAMSARA_BASE = "https://api.samsara.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("SAMSARA_API");
    if (!token) throw new Error("SAMSARA_API secret not set");

    // Same window as the discrepancy: August 2026.
    const startDate = "2026-08-01";
    const endDate = "2026-08-31";

    async function tryEndpoint(label: string, path: string) {
      const url = new URL(`${SAMSARA_BASE}${path}`);
      url.searchParams.set("startDate", startDate);
      url.searchParams.set("endDate", endDate);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let body: any = text;
      try { body = JSON.parse(text); } catch { /* leave as raw text */ }
      return { label, status: res.status, ok: res.ok, body };
    }

    const [jurisdiction, vehicle] = await Promise.all([
      tryEndpoint("GET /fleet/reports/ifta/jurisdiction", "/fleet/reports/ifta/jurisdiction"),
      tryEndpoint("GET /fleet/reports/ifta/vehicle", "/fleet/reports/ifta/vehicle"),
    ]);

    return new Response(JSON.stringify({ jurisdiction, vehicle }, null, 2), {
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
