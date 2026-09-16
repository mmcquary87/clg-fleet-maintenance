// Fleet Maintenance System — Alvys equipment (trucks/trailers) sync
//
// Pulls all trucks + trailers from Alvys and upserts them into our `units`
// table. Matches existing units by number (case-insensitive) so units
// created manually (via intake) get enriched rather than duplicated;
// units.alvys_asset_id is set so future runs update in place.
//
// Also keeps is_active in sync: this function only ever fetches Alvys's
// currently-ACTIVE equipment, so it is authoritative for is_active on any
// unit it has previously synced (i.e. carries an alvys_asset_id) --
// confirmed necessary 2026-09-09 after a units.is_active audit found 100+
// retired/swapped trucks and trailers still flagged active because
// nothing had ever flipped that flag off. A previously-synced unit
// missing from this run's active-equipment fetch has left Alvys's active
// roster (sold, retired, swapped) and is marked inactive; one that
// reappears is marked active again. Units this sync has never touched
// (alvys_asset_id is null -- manually created via intake, or the Penske/
// Hale leased-equipment import) are left alone -- this sync isn't
// authoritative for those.
//
// trucks/search and trailers/search both filter on { Status: ["Active"] }
// -- trucks/search used to filter on { IsActive: true } instead, which
// Alvys silently ignores (confirmed 2026-09-18: that request returned all
// 132 trucks on the account, active and inactive together, against a real
// ~45 active trucks) -- every truck was getting marked is_active: true
// unconditionally as a result, the root cause behind at least one unit
// (9482) showing wrongly Active on the Annual Inspection Compliance
// console. Every truck record does carry its own top-level Status field
// (confirmed via alvys-explore-truck-spec), same shape trailers already
// used correctly.
//
// Also captures each unit's real DOT inspection expiration date --
// InspectionExpirationDate (trucks) / InspectionExpiresAt (trailers) --
// directly off this same trucks/trailers search response, into
// unit_maintenance_due (kind='dot_inspection', basis='alvys_field').
// Confirmed 2026-09-18 to be more reliable than alvys-sync-dot-
// inspections' old approach of parsing a date out of an uploaded
// document's free-text AttachmentType label via a separate per-unit
// GET .../documents call -- that approach picked the wrong document for
// at least one trailer (034003: showed 2026-09-23, Alvys's own real
// field says 2027-09-09). alvys-sync-dot-inspections is superseded by
// this and no longer scheduled (see the migration that unschedules it).
//
// Safe to re-run — idempotent upsert by number/alvys_asset_id.
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role
// access (writes bypass RLS via the service role key, since this runs
// server-side on a schedule/manual trigger, not on behalf of one user).

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 100;

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

async function fetchAllPages(token: string, path: string, extraBody: Record<string, unknown>) {
  const items: any[] = [];
  let page = 0; // Alvys' Page parameter is 0-indexed
  while (true) {
    const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, ...extraBody }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} page ${page} failed (${res.status}): ${text}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`${path} page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    if (typeof json.Total !== "number" || !Array.isArray(json.Items)) {
      throw new Error(`${path} page ${page} unexpected shape: ${text.slice(0, 500)}`);
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getAlvysToken();
    const [trucks, trailers] = await Promise.all([
      fetchAllPages(token, "trucks/search", { Status: ["Active"] }),
      fetchAllPages(token, "trailers/search", { Status: ["Active"] }),
    ]);

    const alvysUnits = [
      ...trucks.map((t) => ({
        number: t.TruckNum, type: "Truck", vin: t.VinNumber ?? null, alvys_asset_id: t.Id,
        year: t.Year ?? null, make: t.Make ?? null, model: t.Model ?? null, fuel_type: t.FuelType ?? null,
        is_active: true, inspection_due_date: t.InspectionExpirationDate ?? null,
      })),
      ...trailers.map((t) => ({
        number: t.TrailerNum, type: "Trailer", vin: t.VinNum ?? null, alvys_asset_id: t.Id,
        year: t.Year ?? null, make: t.Make ?? null, model: t.EquipmentType ?? null, fuel_type: null,
        is_active: true, inspection_due_date: t.InspectionExpiresAt ?? null,
      })),
    ].filter((u) => u.number);
    const activeNumbers = new Set(alvysUnits.map((u) => u.number.toLowerCase()));

    const { data: existing, error: fetchErr } = await supabase.from("units").select("id, number, alvys_asset_id, is_active");
    if (fetchErr) throw fetchErr;
    const byNumber = new Map(existing.map((u: any) => [u.number.toLowerCase(), u.id]));

    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    for (const u of alvysUnits) {
      const existingId = byNumber.get(u.number.toLowerCase());
      if (existingId) {
        toUpdate.push({ id: existingId, ...u });
      } else {
        toInsert.push(u);
      }
    }

    // Previously-synced units no longer in Alvys's active-equipment fetch
    // have left the active roster -- see header comment. Scoped to
    // alvys_asset_id is not null so manually-created/leased-import units
    // (never touched by this sync) are never auto-deactivated.
    const toDeactivate = existing
      .filter((u: any) => u.alvys_asset_id && u.is_active && !activeNumbers.has(u.number.toLowerCase()))
      .map((u: any) => u.id);

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("units").insert(toInsert.map(({ inspection_due_date, ...fields }) => fields));
      if (insErr) throw insErr;
    }
    for (const u of toUpdate) {
      const { id, inspection_due_date, ...fields } = u;
      const { error: updErr } = await supabase.from("units").update(fields).eq("id", id);
      if (updErr) throw updErr;
    }
    if (toDeactivate.length > 0) {
      const { error: deactErr } = await supabase.from("units").update({ is_active: false }).in("id", toDeactivate);
      if (deactErr) throw deactErr;
    }

    // Re-fetch ids fresh rather than trust insert-order matching -- covers
    // both branches (toInsert didn't have one yet, toUpdate's is already
    // known but this keeps the two paths identical) in one pass.
    const { data: withIds, error: idsErr } = await supabase.from("units").select("id, number").in(
      "number", alvysUnits.map((u) => u.number)
    );
    if (idsErr) throw idsErr;
    const idByNumber = new Map(withIds.map((u: any) => [u.number.toLowerCase(), u.id]));

    const dueRows = alvysUnits
      .filter((u) => u.inspection_due_date && idByNumber.has(u.number.toLowerCase()))
      .map((u) => ({
        unit_id: idByNumber.get(u.number.toLowerCase()),
        kind: "dot_inspection",
        label: "Annual DOT Inspection",
        due_date: u.inspection_due_date,
        basis: "alvys_field",
        synced_at: new Date().toISOString(),
      }));
    if (dueRows.length > 0) {
      const { error: dueErr } = await supabase.from("unit_maintenance_due").upsert(dueRows, { onConflict: "unit_id,kind" });
      if (dueErr) throw dueErr;
    }

    return new Response(JSON.stringify({
      trucksFound: trucks.length,
      trailersFound: trailers.length,
      unitsCreated: toInsert.length,
      unitsUpdated: toUpdate.length,
      unitsDeactivated: toDeactivate.length,
      inspectionDatesSynced: dueRows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
