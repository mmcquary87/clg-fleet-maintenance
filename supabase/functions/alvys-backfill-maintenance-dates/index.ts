// Fleet Maintenance System — one-time backfill: correct Alvys-imported work
// order dates from CreatedAt to the real Date field (ONE-TIME USE)
//
// alvys-import-maintenance previously set date_opened/date_closed from
// r.CreatedAt (when the record was typed into Alvys) instead of r.Date (the
// real service date) -- confirmed and fixed 2026-10-30 (see that function's
// own header). The fix only applies to NEW records going forward; every
// work order imported before the fix (1,751 as of 2026-10-30) still
// carries the old, sometimes-weeks-wrong dates. This corrects them in
// place, once.
//
// Scope: only touches work_orders rows with alvys_maintenance_id set (i.e.
// rows this sync created) -- never touches a manually-created work order.
// Only updates a row when Alvys's real Date differs from what's currently
// stored, setting both date_opened and date_closed to that corrected value
// (matching how alvys-import-maintenance always set both equal on import).
// Safe to re-run -- a row already matching Alvys's Date is skipped, so
// running this twice does nothing extra the second time.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role.
// Delete once run successfully.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 200;
const UPDATE_CONCURRENCY = 25;

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

// Same pagination-safety reasoning as alvys-import-maintenance's own
// fetchAllExistingMaintenanceIds -- PostgREST caps an unbounded select at
// 1000 rows, and there are more than 1000 Alvys-sourced work orders.
async function fetchAllAlvysSourcedWorkOrders(supabase: ReturnType<typeof createClient>) {
  const rows: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("work_orders")
      .select("id, alvys_maintenance_id, date_opened, date_closed")
      .not("alvys_maintenance_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getAlvysToken();
    const records = await fetchAllMaintenance(token);
    const realDateById = new Map<string, string>();
    for (const r of records) {
      if (r.Date) realDateById.set(r.Id, String(r.Date).slice(0, 10));
    }

    const workOrders = await fetchAllAlvysSourcedWorkOrders(supabase);

    const toCorrect: Array<{ id: string; realDate: string }> = [];
    let alreadyCorrect = 0;
    let noAlvysRecordFound = 0;
    for (const wo of workOrders) {
      const realDate = realDateById.get(wo.alvys_maintenance_id);
      if (!realDate) { noAlvysRecordFound++; continue; }
      if (wo.date_opened === realDate && wo.date_closed === realDate) { alreadyCorrect++; continue; }
      toCorrect.push({ id: wo.id, realDate });
    }

    let corrected = 0;
    const errors: string[] = [];
    for (const batch of chunk(toCorrect, UPDATE_CONCURRENCY)) {
      const results = await Promise.all(batch.map((item) =>
        supabase.from("work_orders").update({ date_opened: item.realDate, date_closed: item.realDate }).eq("id", item.id)
      ));
      for (const { error } of results) {
        if (error) errors.push(error.message);
        else corrected++;
      }
    }

    return new Response(JSON.stringify({
      totalAlvysSourcedWorkOrders: workOrders.length,
      corrected,
      alreadyCorrect,
      noAlvysRecordFound,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
