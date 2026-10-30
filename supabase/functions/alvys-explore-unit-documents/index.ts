// Fleet Maintenance System — Alvys unit documents probe (TEMPORARY)
//
// CLG wants past/current truck registration documents (not just the plate
// number/expiration already synced via alvys-sync-equipment) pulled from
// Alvys into CLGOS's unit_documents table (which already has a
// 'registration' doc_type, 20260907040000). The now-retired
// alvys-sync-dot-inspections confirmed a working per-unit documents LIST
// endpoint (GET /{trucks|trailers}/{assetId}/documents) carrying an
// AttachmentType label per entry, including "Registration" -- and its own
// header noted old certificates sit alongside the current one in that
// same list, which is exactly what "previous registration" needs. What
// isn't confirmed: the full field shape of each list entry (a document
// id? an upload date? a direct file URL?), and whether the actual file
// bytes come back from that same list call or need a second per-document
// GET (alvys-explore-truck-documents's own header mentioned a
// .../documents/{documentId} shape but never confirmed it against a real
// response).
//
// For a couple of real units: dumps the full raw documents-list response,
// then -- for whichever entries look registration-related -- attempts a
// per-document GET to see whether that actually returns file content
// (and what content-type) or more metadata.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role
// (to pick real units with an alvys_asset_id). Read-only. Delete once the
// real sync is built and confirmed.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const SAMPLE_UNITS = 3;

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

function looksLikeRegistration(attachmentType: string): boolean {
  return (attachmentType || "").toLowerCase().includes("registration");
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
      .in("type", ["Truck", "Trailer"]).not("alvys_asset_id", "is", null)
      .limit(SAMPLE_UNITS);
    if (unitsErr) throw unitsErr;

    const results = [];
    for (const u of units) {
      const path = u.type === "Truck" ? "trucks" : "trailers";
      const listRes = await fetch(`${ALVYS_API_BASE}/${path}/${u.alvys_asset_id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listText = await listRes.text();
      let docs: any[] = [];
      try { docs = JSON.parse(listText) ?? []; } catch { /* leave empty, raw text reported below */ }

      const registrationDocs = docs.filter((d) => looksLikeRegistration(d.AttachmentType));

      // Try fetching one actual registration document's content, if any
      // exist, to see what a per-document GET actually returns.
      let sampleFetch: any = null;
      const firstDoc = registrationDocs[0];
      const docId = firstDoc?.Id ?? firstDoc?.DocumentId ?? firstDoc?.AttachmentId ?? null;
      if (docId) {
        const docRes = await fetch(`${ALVYS_API_BASE}/${path}/${u.alvys_asset_id}/documents/${docId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = docRes.headers.get("content-type") ?? null;
        const isLikelyBinary = contentType && !contentType.includes("json") && !contentType.includes("text");
        sampleFetch = {
          docId,
          status: docRes.status,
          ok: docRes.ok,
          contentType,
          bodyPreview: isLikelyBinary
            ? `<binary, ${docRes.headers.get("content-length") ?? "unknown"} bytes -- not printed>`
            : (await docRes.text()).slice(0, 1000),
        };
      }

      results.push({
        unitNumber: u.number,
        unitType: u.type,
        listStatus: listRes.status,
        listOk: listRes.ok,
        totalDocuments: docs.length,
        registrationDocumentCount: registrationDocs.length,
        allAttachmentTypes: docs.map((d) => d.AttachmentType),
        rawRegistrationDocs: registrationDocs,
        sampleDocumentFetch: sampleFetch,
      });
    }

    return new Response(JSON.stringify({ results }, null, 2), {
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
