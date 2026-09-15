// Fleet Maintenance System — Alvys maintenance record import
//
// Pulls all maintenance records from Alvys and inserts any not already in
// our `work_orders` table as Closed (already-completed) work orders.
// Alvys's "Category" field is free text (e.g. "rfi tire replaced"), not
// our fixed 9-category enum, so this classifies it with a keyword
// heuristic.
//
// INSERT-ONLY by work_orders.alvys_maintenance_id -- deliberately not an
// upsert (2026-09-17). This now runs on a 15-minute pg_cron schedule
// (20260917020000_alvys_maintenance_sync_schedule.sql), same as
// samsara-sync, and an upsert would silently overwrite any manual
// correction made after import (category, cost, vendor, status, dates)
// back to Alvys's raw values on every run. Insert-only means a record
// already in our system is never touched again by this function, no
// matter how it's since been edited here -- only genuinely new Alvys
// records get pulled in.
//
// Run alvys-sync-equipment FIRST so units already exist to attach to.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORY_RULES: [string, string[]][] = [
  ["DOT Inspection", ["dot", "inspection", "inspec"]],
  ["Tires", ["tire", "tyre"]],
  ["Brakes", ["brake", "abs "]],
  ["Transmission", ["transmission", "clutch"]],
  ["Electrical", ["electrical", "battery", "alternator", "wiring", "abs light", "light"]],
  ["Trailer / Body", ["trailer", "mudflap", "mud flap", "bracket", "door", "bumper", "fender", "body"]],
  ["PM / Oil", ["pm ", "pm,", "oil", "service", "lube", "grease", "a-service", "b-service", "regen"]],
  ["Engine", ["engine", "turbo", "injector", "dpf", "compressor", "governor", "air system"]],
];

function classifyCategory(text: string): string {
  const t = (text || "").toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((k) => t.includes(k))) return category;
  }
  return "Other";
}

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
  let page = 0; // Alvys' Page parameter is 0-indexed
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
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`maintenance/search page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    if (typeof json.Total !== "number" || !Array.isArray(json.Items)) {
      throw new Error(`maintenance/search page ${page} unexpected shape: ${text.slice(0, 500)}`);
    }
    items.push(...json.Items);
    if (items.length >= json.Total || json.Items.length === 0) break;
    page += 1;
  }
  return items;
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
    const rawRecords = await fetchAllMaintenance(token);

    // Alvys's paged results can include the same record twice if new
    // records are added in Alvys while this is still paging through
    // (page boundaries shift mid-fetch) -- de-dupe by Id so a single run
    // never tries to insert the same alvys_maintenance_id twice in one
    // batch, which the unique constraint correctly rejects.
    const allRecords = [...new Map(rawRecords.map((r) => [r.Id, r])).values()];

    // Insert-only: skip anything already pulled in on a previous run (see
    // header comment) so this is safe to run unattended on a schedule.
    const { data: existingRows, error: existingErr } = await supabase
      .from("work_orders").select("alvys_maintenance_id").not("alvys_maintenance_id", "is", null);
    if (existingErr) throw existingErr;
    const existingIds = new Set(existingRows.map((r: any) => r.alvys_maintenance_id));
    const records = allRecords.filter((r) => !existingIds.has(r.Id));

    // Resolve units: match by alvys_asset_id first, fall back to number.
    const { data: units, error: unitsErr } = await supabase.from("units").select("id, number, alvys_asset_id");
    if (unitsErr) throw unitsErr;
    const unitByAssetId = new Map(units.filter((u: any) => u.alvys_asset_id).map((u: any) => [u.alvys_asset_id, u.id]));
    const unitByNumber = new Map(units.map((u: any) => [u.number.toLowerCase(), u.id]));

    // Any assets referenced by maintenance records but not yet in our units
    // table (equipment sync wasn't run, or this asset isn't in trucks/trailers
    // search results) — create bare records for them so the work order has
    // somewhere to attach.
    const missingUnits = new Map<string, { number: string; type: string }>();
    for (const r of records) {
      const asset = r.RelatedAsset;
      if (!asset?.AssetNumber) continue;
      const resolved = unitByAssetId.get(asset.AssetId) ?? unitByNumber.get(asset.AssetNumber.toLowerCase());
      if (!resolved && !missingUnits.has(asset.AssetNumber.toLowerCase())) {
        missingUnits.set(asset.AssetNumber.toLowerCase(), {
          number: asset.AssetNumber,
          type: asset.AssetType === "Trailer" ? "Trailer" : "Truck",
        });
      }
    }
    if (missingUnits.size > 0) {
      const { data: created, error: createErr } = await supabase
        .from("units").insert(Array.from(missingUnits.values())).select("id, number");
      if (createErr) throw createErr;
      created.forEach((u: any) => unitByNumber.set(u.number.toLowerCase(), u.id));
    }

    // Resolve vendors (RepairShop.Name).
    const vendorNames = [...new Set(records.map((r) => r.RepairShop?.Name).filter(Boolean))];
    const { data: existingVendors, error: vendorsErr } = await supabase.from("vendors").select("id, name");
    if (vendorsErr) throw vendorsErr;
    const vendorByName = new Map(existingVendors.map((v: any) => [v.name.toLowerCase(), v.id]));
    const missingVendorNames = vendorNames.filter((n) => !vendorByName.has(n.toLowerCase()));
    if (missingVendorNames.length > 0) {
      const { data: createdVendors, error: createVendorErr } = await supabase
        .from("vendors").insert(missingVendorNames.map((name) => ({ name }))).select("id, name");
      if (createVendorErr) throw createVendorErr;
      createdVendors.forEach((v: any) => vendorByName.set(v.name.toLowerCase(), v.id));
    }

    // Build work_order rows.
    const rows = records
      .filter((r) => r.RelatedAsset?.AssetNumber)
      .map((r) => {
        const unitId = unitByAssetId.get(r.RelatedAsset.AssetId) ?? unitByNumber.get(r.RelatedAsset.AssetNumber.toLowerCase());
        const categoryText = r.Category?.Name || r.Description || "";
        return {
          unit_id: unitId,
          vendor_id: r.RepairShop?.Name ? vendorByName.get(r.RepairShop.Name.toLowerCase()) : null,
          category: classifyCategory(categoryText),
          description: categoryText || r.Comments || null,
          cost: r.Amount?.Amount ?? 0,
          status: "Closed",
          date_opened: (r.CreatedAt || new Date().toISOString()).slice(0, 10),
          date_closed: (r.CreatedAt || new Date().toISOString()).slice(0, 10),
          invoice_ref: r.Reference || null,
          po_number: r.PO || null,
          source: "manual",
          alvys_maintenance_id: r.Id,
        };
      })
      .filter((r) => r.unit_id);

    let inserted = 0;
    for (const batch of chunk(rows, 500)) {
      const { error: insertErr } = await supabase.from("work_orders").insert(batch);
      if (insertErr) throw insertErr;
      inserted += batch.length;
    }

    return new Response(JSON.stringify({
      recordsFoundInAlvys: allRecords.length,
      alreadyImported: allRecords.length - records.length,
      newRecordsThisRun: records.length,
      unitsCreatedForOrphans: missingUnits.size,
      vendorsCreated: missingVendorNames.length,
      workOrdersInserted: inserted,
      skippedNoAsset: records.length - rows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === "object" && "message" in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
