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
// INCREMENTAL, not full-snapshot: a live run against the whole fleet (241
// units) got 429'd on ~185 of them at both CONCURRENCY=8 and CONCURRENCY=3
// -- barely different, which points to a coarser per-minute/per-hour
// account-wide limit (already partly used up from repeated test runs),
// not just this run's own request pacing. No amount of intra-run
// throttling fixes that in one shot, so instead this only processes units
// that don't have a resolved answer yet (no row at all, or a previous
// 'fetch_error') and caps itself at BATCH_SIZE per invocation --
// re-running it (a few times, spaced a bit apart) converges on the whole
// fleet without re-fighting the same rate limit budget on units already
// answered. Units already resolved as 'alvys_certificate' or
// 'no_document_on_file' are skipped entirely on subsequent runs.
//
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const CONCURRENCY = 2;
const MAX_429_RETRIES = 4;
const BATCH_SIZE = 60;

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

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) return res;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // 1s, 2s, 4s, 8s
  }
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

    const { data: allUnits, error: unitsErr } = await supabase
      .from("units").select("id, number, type, alvys_asset_id")
      .in("type", ["Truck", "Trailer"]).not("alvys_asset_id", "is", null);
    if (unitsErr) throw unitsErr;

    const { data: existing, error: existingErr } = await supabase
      .from("unit_maintenance_due").select("unit_id, basis").eq("kind", "dot_inspection");
    if (existingErr) throw existingErr;
    const resolvedUnitIds = new Set(
      existing.filter((r) => r.basis === "alvys_certificate" || r.basis === "no_document_on_file").map((r) => r.unit_id)
    );

    const remaining = allUnits.filter((u) => !resolvedUnitIds.has(u.id));
    const units = remaining.slice(0, BATCH_SIZE);

    const runStartedAt = new Date().toISOString();
    let noDocument = 0;
    const errorSamples: { unitNumber: string; type: string; message: string }[] = [];
    const errorsByStatus: Record<string, number> = {};

    const rows = await mapWithConcurrency(units, CONCURRENCY, async (u) => {
      const path = u.type === "Truck" ? "trucks" : "trailers";
      try {
        const res = await fetchWithRetry(`${ALVYS_API_BASE}/${path}/${u.alvys_asset_id}/documents`, {
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
        const message = err instanceof Error ? err.message : String(err);
        const statusKey = message.slice(0, 3);
        errorsByStatus[statusKey] = (errorsByStatus[statusKey] ?? 0) + 1;
        if (errorSamples.length < 15) errorSamples.push({ unitNumber: u.number, type: u.type, message });
        // 'fetch_error', not 'no_document_on_file' -- next run retries this
        // unit instead of treating "couldn't check" as "confirmed absent."
        return { unit_id: u.id, kind: "dot_inspection", label: "Annual DOT Inspection", due_date: null, basis: "fetch_error", synced_at: runStartedAt };
      }
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("unit_maintenance_due").upsert(rows, { onConflict: "unit_id,kind" });
      if (upsertErr) throw upsertErr;
    }

    const fetchErrors = Object.values(errorsByStatus).reduce((s, n) => s + n, 0);
    return new Response(JSON.stringify({
      totalUnits: allUnits.length,
      alreadyResolvedBeforeThisRun: resolvedUnitIds.size,
      processedThisRun: units.length,
      stillRemainingAfterThisRun: remaining.length - units.length,
      withCertificate: rows.filter((r) => r.basis === "alvys_certificate").length,
      noDocumentOnFile: noDocument,
      fetchErrors,
      errorsByStatus,
      errorSamples,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
