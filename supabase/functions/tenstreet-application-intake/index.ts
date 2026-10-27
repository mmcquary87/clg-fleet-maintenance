// Owner-Operator Recruiting — Tenstreet inbound listener (Application feed)
//
// Deno Edge Function. Tenstreet's own internal dashboard process POSTs
// application XML here when a candidate applies or their application
// changes -- we never request this, there is no polling. See RECRUITING.md
// section 4 and Tenstreet's "Receiving Application Data from Tenstreet"
// API guide (rev 11/2014).
//
// Must be deployed with "Enforce JWT verification" turned OFF (Supabase
// dashboard, this function's settings) -- Tenstreet has no Supabase user
// session to present, same precedent as email-intake (Mailgun). Tenstreet's
// guide never specifies how it authenticates TO us, so the URL Tenstreet is
// given already carries a long random secret as its final path segment,
// checked below -- Tenstreet just needs "an HTTPS endpoint," no custom
// header or Basic-auth setup on their end. If Tenstreet later confirms they
// CAN send a custom header or Basic auth, switch to that instead (a header
// is stronger than a URL, which can end up logged somewhere).
//
// Required Edge Function secrets:
//   TENSTREET_APPLICATION_URL_SECRET — the path secret above
//   TENSTREET_ENCRYPTION_KEY — passphrase pgcrypto encrypts the SSN/raw
//     XML with at rest (see 20261027020000_tenstreet_integration.sql);
//     lives only here, never in the database
//   TENSTREET_EXPECTED_COMPANY_ID — optional. If set, a post with a
//     different Tenstreet CompanyId is REJECTED (the guide's own example
//     of a rejectable condition). Leave unset until Tenstreet confirms
//     CLG's real Company ID -- every post is accepted regardless of
//     CompanyId until then.
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are already available to every
// edge function.
//
// The real schema is still provisional -- Tenstreet's guide describes the
// fields but its linked sample XML files weren't retrievable, and it never
// names the root element. So this parses tolerantly: it finds known
// element names (PersonalData, SSN, Mode, CompanyId, CustomDataElements,
// ...) anywhere in the tree instead of requiring an exact path, and always
// keeps the full raw XML (encrypted) and the full parsed ApplicationData/
// PersonalData/CustomDataElements tree as jsonb even though only a few
// fields are mapped onto the leads row -- "pull in as much data as
// possible" per CLG direction (2026-10-27), not just what we're confident
// how to map. Update the mapping below once Tenstreet sends real samples.
//
// Responds ACCEPTED/REJECTED before the script finishes, per Tenstreet's
// own requirement (it won't consider the post complete otherwise). An
// internal failure (storage/db down) returns 5xx instead, so Tenstreet
// treats it as a technical problem worth retrying rather than a rejection
// needing a different applicant.
//
// Dedupe/identity: Tenstreet's guide never names a stable applicant ID for
// this feed (an open question sent back to Tenstreet). Until they answer,
// this dedupes provisionally on SSN last-4 + a matching phone or email
// against an existing Tenstreet-sourced lead -- a reasonable guess, not a
// guarantee. Replace with a real applicant ID once Tenstreet confirms one.

import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

const URL_SECRET = Deno.env.get("TENSTREET_APPLICATION_URL_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("TENSTREET_ENCRYPTION_KEY")!;
const EXPECTED_COMPANY_ID = Deno.env.get("TENSTREET_EXPECTED_COMPANY_ID") || null;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_BODY_BYTES = 2_000_000; // this feed carries no files, unlike Documents

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The application guide's own heading uses "TenstreetResponse" (lowercase
// s) -- the documents guide uses "TenStreetResponse" instead. Each
// listener matches its own guide's casing until Tenstreet confirms one.
function xmlResponse(status: "ACCEPTED" | "REJECTED", description: string, httpStatus: number): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<TenstreetResponse>\n  <Status>${status}</Status>\n  <Description>${escapeXml(description)}</Description>\n</TenstreetResponse>`;
  return new Response(body, { status: httpStatus, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

// Finds the first value anywhere in a parsed XML tree whose key matches
// `tag` (case-insensitive) -- tolerates not knowing the real root element
// or exact nesting path, since no real sample XML is available yet.
function findFirst(node: unknown, tag: string): unknown {
  if (node == null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirst(item, tag);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === tag.toLowerCase()) return obj[key];
  }
  for (const key of Object.keys(obj)) {
    const found = findFirst(obj[key], tag);
    if (found !== undefined) return found;
  }
  return undefined;
}

function text(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const providedSecret = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (providedSecret !== URL_SECRET) {
    console.error("tenstreet-application-intake: bad or missing URL secret");
    return new Response("Forbidden", { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return xmlResponse("REJECTED", "Payload too large.", 200);
  }

  const rawXml = await req.text();
  if (!rawXml.trim()) {
    return xmlResponse("REJECTED", "Empty request body.", 200);
  }

  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const logAndRespond = async (args: {
    mode: string | null; companyId: string | null; leadId: string | null;
    httpStatus: number; status: "ACCEPTED" | "REJECTED"; description: string; outcome: string;
  }) => {
    try {
      const { error: logErr } = await admin.rpc("tenstreet_log_inbound", {
        p_route: "application", p_source_ip: sourceIp, p_mode: args.mode, p_company_id: args.companyId,
        p_file_id: null, p_lead_id: args.leadId, p_raw_xml: rawXml, p_http_status: args.httpStatus,
        p_response_status: args.status, p_response_description: args.description,
        p_processing_outcome: args.outcome, p_processing_duration_ms: Date.now() - startedAt, p_key: ENCRYPTION_KEY,
      });
      if (logErr) console.error("tenstreet-application-intake: failed to write inbound log:", logErr);
    } catch (logErr) {
      console.error("tenstreet-application-intake: failed to write inbound log:", logErr);
    }
    return xmlResponse(args.status, args.description, args.httpStatus);
  };

  let parsed: unknown;
  try {
    const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
    parsed = parser.parse(rawXml);
  } catch (err) {
    console.error("tenstreet-application-intake: XML parse failed:", err);
    return await logAndRespond({ mode: null, companyId: null, leadId: null, httpStatus: 200, status: "REJECTED", description: "Malformed XML.", outcome: "rejected_malformed_xml" });
  }

  const mode = text(findFirst(parsed, "Mode"));
  const companyId = text(findFirst(parsed, "CompanyId"));

  if (EXPECTED_COMPANY_ID && companyId && companyId !== EXPECTED_COMPANY_ID) {
    return await logAndRespond({ mode, companyId, leadId: null, httpStatus: 200, status: "REJECTED", description: "Unrecognized Company ID.", outcome: "rejected_wrong_company_id" });
  }

  const personalData = findFirst(parsed, "PersonalData") ?? {};
  const applicationData = findFirst(parsed, "ApplicationData") ?? null;
  const customDataElements = findFirst(parsed, "CustomDataElements") ?? null;
  const providerVerifiedData = findFirst(parsed, "ProviderVerifiedData") ?? null;
  const formsData = findFirst(parsed, "FormsData") ?? null;
  const driverChangeLog = findFirst(parsed, "DriverChangeLog") ?? null;

  const firstName = text(findFirst(personalData, "FirstName"));
  const lastName = text(findFirst(personalData, "LastName"));
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || text(findFirst(personalData, "Name"));
  const phone = text(findFirst(personalData, "Phone")) ?? text(findFirst(personalData, "CellPhone")) ?? text(findFirst(personalData, "HomePhone"));
  const email = text(findFirst(personalData, "Email"));
  const city = text(findFirst(personalData, "City"));
  const state = text(findFirst(personalData, "State"));
  const ssn = text(findFirst(personalData, "SSN")) ?? text(findFirst(parsed, "SSN"));
  const ssnLast4 = ssn ? (ssn.replace(/\D/g, "").slice(-4) || null) : null;

  try {
    // Dedupe provisionally on ssn last-4 + a matching phone/email -- see
    // header comment.
    let existingLeadId: string | null = null;
    if (ssnLast4) {
      const { data: candidates } = await admin
        .from("tenstreet_applicant_identity")
        .select("lead_id, leads!inner(phone, email)")
        .eq("ssn_last4", ssnLast4);
      // deno-lint-ignore no-explicit-any
      const match = (candidates ?? []).find((c: any) => (phone && c.leads?.phone === phone) || (email && c.leads?.email === email));
      if (match) existingLeadId = match.lead_id as string;
    }

    let leadId = existingLeadId;
    let outcome = "created_lead";
    let description = "Application received and stored.";

    if (leadId) {
      await admin.from("leads").update({
        ...(fullName ? { legal_name: fullName, contact_name: fullName } : {}),
        ...(phone ? { phone } : {}), ...(email ? { email } : {}),
        ...(city ? { city } : {}), ...(state ? { state } : {}),
        source_mode: mode,
      }).eq("id", leadId);
      outcome = "updated_existing_lead";
      description = "Application already received; existing record updated.";
    } else {
      const { data: inserted, error: insertErr } = await admin.from("leads").insert({
        segment: "driver",
        source_code: "tenstreet",
        source_detail: companyId ? `Tenstreet CompanyId ${companyId}` : "Tenstreet application",
        source_mode: mode,
        legal_name: fullName, contact_name: fullName,
        phone, email, city, state,
      }).select("id").single();
      if (insertErr || !inserted) throw insertErr ?? new Error("Insert returned no row");
      leadId = inserted.id as string;
    }

    const { error: identityErr } = await admin.rpc("tenstreet_upsert_applicant_identity", {
      p_lead_id: leadId, p_company_id: companyId, p_ssn: ssn,
      p_raw_application: { personalData, applicationData, providerVerifiedData, formsData, driverChangeLog, customDataElements },
      p_key: ENCRYPTION_KEY,
    });
    if (identityErr) throw identityErr;

    return await logAndRespond({ mode, companyId, leadId, httpStatus: 200, status: "ACCEPTED", description, outcome });
  } catch (err) {
    console.error("tenstreet-application-intake: processing failed:", err);
    try {
      await admin.rpc("tenstreet_log_inbound", {
        p_route: "application", p_source_ip: sourceIp, p_mode: mode, p_company_id: companyId,
        p_file_id: null, p_lead_id: null, p_raw_xml: rawXml, p_http_status: 500,
        p_response_status: "", p_response_description: "", p_processing_outcome: "internal_error",
        p_processing_duration_ms: Date.now() - startedAt, p_key: ENCRYPTION_KEY,
      });
    } catch { /* best-effort -- never let logging itself crash the error path */ }
    return new Response("Internal error", { status: 500 });
  }
});
