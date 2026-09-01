// Fleet Maintenance System — Samsara Preventive Maintenance discovery probe
// (TEMPORARY)
//
// CLG already has real PM schedules configured in Samsara's own dashboard
// (Oil Change - Freightliner/Volvo/Mack/Penske variants, distance-based;
// Annual DOT Inspection, date-based; exported CSV confirmed this
// 2026-09-01) — this app just doesn't read them yet. Samsara's docs
// describe GET /maintenance/preventive/upcoming as returning "a paginated
// list of upcoming preventive maintenance schedules for the organization's
// assets, enriched with live telemetry (current odometer, engine hours)
// and due-date projections" — exactly the "next service due per unit"
// data needed to move off the manual pm_interval_days field (see
// 20260828070000_unit_maintenance_schedule.sql) onto CLG's real,
// engine/spec-based schedules. developers.samsara.com is unreachable from
// this environment's network, so the exact response field names haven't
// been confirmed — this probe does that against the real account before
// any real sync/schema is built.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires SAMSARA_API secret -- the token needs "Read Upcoming Preventive
// Maintenance" under the Preventive Maintenance permission category
// (per Samsara's docs); if this 403s, that scope is probably missing.
// Delete once the real field names are confirmed.

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

    const url = new URL(`${SAMSARA_BASE}/maintenance/preventive/upcoming`);
    url.searchParams.set("limit", "20");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`preventive/upcoming returned non-JSON (${res.status}): ${text.slice(0, 800)}`); }
    if (!res.ok) throw new Error(`preventive/upcoming failed (${res.status}): ${text.slice(0, 800)}`);

    const items: any[] = json.data ?? json.items ?? [];

    return new Response(JSON.stringify({
      topLevelKeys: Object.keys(json),
      itemCount: items.length,
      hasPagination: json.pagination ?? null,
      // Every distinct key seen across the sample -- a raw dump alone is
      // easy to skim past a sparsely-populated field.
      itemKeysSeen: [...new Set(items.flatMap((i) => Object.keys(i)))],
      sampleItems: items.slice(0, 10),
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
