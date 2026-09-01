// Fleet Maintenance System — Annual DOT Inspection due dates from Alvys
//
// Per CLG's direction (2026-09-01), this is sourced from Alvys instead of
// Samsara's generic PM schedule: GET trucks/{id}/documents (confirmed
// working against the real account) returns each unit's uploaded
// documents, and the actual inspection certificate's real expiration date
// is embedded in its free-text AttachmentType label -- e.g.
// "DOT annual inspection expires 7/17/2027". There's no dedicated
// expiration-date field, so this parses the date out the same way
// alvys-import-maintenance classifies its free-text Category field: a
// keyword/pattern heuristic, not a guaranteed-structured value.
//
// Not to be confused with the document API response's own ExpiresAt field
// -- that's just the signed download URL's ~11-minute TTL, unrelated to
// the certificate's real-world expiration.
//
// Safe to re-run -- full-snapshot upsert into unit_maintenance_due
// (kind = 'dot_inspection'), stale rows (e.g. a deactivated unit) deleted
// by synced_at cutoff. Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET +
// service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const CONCURRENCY = 8;

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

// "DOT annual inspection expires 7/17/2027" -> requires both an
// inspection-ish word and a dot/annual qualifier, to avoid matching
// unrelated documents (Registration, Insurance Certificate, Vehicle Image,
// VIN plate all seen as real AttachmentType values in this account).
function looksLikeDotInspection(attachmentType: string): boolean {
  const t = (attachmentType || "").toLowerCase();
  return t.includes("inspection") && (t.includes("dot") || t.includes("annual"));
}

// Pulls the first mm/dd/yyyy (or mm/dd/yy) date found in the label.
function parseDateFromLabel(attachmentType: string): string | null {
  const m = (attachmentType || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let [, mo, day, yr] = m;
  if (yr.length === 2) yr = `20${yr}`;
  const iso = `${yr}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getAlvysToken();

    const { data: units, error: unitsErr } = await supabase
      .from("units").select("id, number, type, alvys_asset_id")
      .in("type", ["Truck", "Trailer"]).not("alvys_asset_id", "is", null);
    if (unitsErr) throw unitsErr;

    const runStartedAt = new Date().toISOString();
    let noDocument = 0;
    let errors = 0;

    const rows = await mapWithConcurrency(units, CONCURRENCY, async (u) => {
      const path = u.type === "Truck" ? "trucks" : "trailers";
      try {
        const res = await fetch(`${ALVYS_API_BASE}/${path}/${u.alvys_asset_id}/documents`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
        const docs: any[] = JSON.parse(text) ?? [];

        const candidates = docs
          .filter((d) => looksLikeDotInspection(d.AttachmentType))
          .map((d) => ({ dueDate: parseDateFromLabel(d.AttachmentType) }))
          .filter((c) => c.dueDate);

        // Old certificates can still be sitting in the list alongside the
        // current one -- the furthest-future date is the current cert.
        const best = candidates.sort((a, b) => (b.dueDate! > a.dueDate! ? 1 : -1))[0];

        if (!best) {
          noDocument += 1;
          return { unit_id: u.id, kind: "dot_inspection", label: "Annual DOT Inspection", due_date: null, basis: "no_document_on_file", synced_at: runStartedAt };
        }
        return { unit_id: u.id, kind: "dot_inspection", label: "Annual DOT Inspection", due_date: best.dueDate, basis: "alvys_certificate", synced_at: runStartedAt };
      } catch (err) {
        errors += 1;
        return { unit_id: u.id, kind: "dot_inspection", label: "Annual DOT Inspection", due_date: null, basis: "no_document_on_file", synced_at: runStartedAt };
      }
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("unit_maintenance_due").upsert(rows, { onConflict: "unit_id,kind" });
      if (upsertErr) throw upsertErr;
    }

    const { error: cleanupErr } = await supabase
      .from("unit_maintenance_due").delete().eq("kind", "dot_inspection").lt("synced_at", runStartedAt);
    if (cleanupErr) throw cleanupErr;

    return new Response(JSON.stringify({
      unitsChecked: units.length,
      withCertificate: rows.length - noDocument - errors,
      noDocumentOnFile: noDocument,
      fetchErrors: errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
