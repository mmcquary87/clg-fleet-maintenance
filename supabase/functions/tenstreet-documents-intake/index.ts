// Owner-Operator Recruiting — Tenstreet inbound listener (Documents feed)
//
// Deno Edge Function. Tenstreet's own internal dashboard process POSTs a
// document (MVR, PSP, Certificate of Compliance, ...) here as base64 inside
// XML, alongside the driver's SSN, when one is added to a driver in their
// system -- we never request this, there is no polling. See RECRUITING.md
// section 4 and Tenstreet's "Receiving Documents from Tenstreet" API guide
// (rev 11/2014).
//
// Must be deployed with "Enforce JWT verification" turned OFF (Supabase
// dashboard, this function's settings) -- same precedent as email-intake
// and tenstreet-application-intake (see that function's header for the
// auth-mechanism reasoning). The URL Tenstreet is given already carries a
// long random secret as a `key` query parameter, checked below.
//
// Required Edge Function secrets:
//   TENSTREET_DOCUMENTS_URL_SECRET — the query-parameter secret above (deliberately a
//     DIFFERENT secret than the application feed's, so either can be
//     rotated independently)
//   TENSTREET_ENCRYPTION_KEY — same key tenstreet-application-intake uses;
//     encrypts the SSN/raw XML at rest, never stored in the database
//   TENSTREET_EXPECTED_COMPANY_ID — optional, same meaning as the
//     application listener's
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are already available to every
// edge function.
//
// This feed carries actual background-check files (MVR/PSP), the single
// most sensitive thing this integration handles -- they land in the
// private 'tenstreet-documents' storage bucket (recruiter/admin RLS only,
// NOT the broad "authenticated" policy most buckets in this app use), and
// the SSN that identifies whose file it is is encrypted at rest, same as
// the application feed. FileData is treated as untrusted: a decoded size
// wildly different from the stated FileSize is logged as a discrepancy,
// but the file is still stored rather than dropped -- "pull in as much
// data as possible" per CLG direction (2026-10-27) outweighs losing real
// compliance data over what's likely just a formatting quirk on
// Tenstreet's side. A file that fails to base64-decode at all, or exceeds
// the configured size cap, is rejected outright.
//
// Idempotency: upserts on (tenstreet_file_id, tenstreet_company_id), the
// handover doc's own suggested key, so a Tenstreet re-post overwrites the
// same row/storage object and still replies ACCEPTED rather than creating
// a duplicate.
//
// Matching to a lead: by ssn_last4 against tenstreet_applicant_identity
// (the application feed's own table). Exactly one match links the
// document; zero or multiple leaves lead_id null for a recruiter to link
// by hand later rather than guessing wrong.

import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

const URL_SECRET = Deno.env.get("TENSTREET_DOCUMENTS_URL_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("TENSTREET_ENCRYPTION_KEY")!;
const EXPECTED_COMPANY_ID = Deno.env.get("TENSTREET_EXPECTED_COMPANY_ID") || null;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Files arrive base64-encoded inside the XML -- Tenstreet states no
// maximum, so this is a configurable guess (a multi-page scanned MVR/PSP
// PDF comfortably fits).
const MAX_BODY_BYTES = 25_000_000;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The documents guide's own heading uses "TenStreetResponse" (capital
// S) -- the application guide uses "TenstreetResponse" instead. Each
// listener matches its own guide's casing until Tenstreet confirms one.
function xmlResponse(status: "ACCEPTED" | "REJECTED", description: string, httpStatus: number): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<TenStreetResponse>\n  <Status>${status}</Status>\n  <Description>${escapeXml(description)}</Description>\n</TenStreetResponse>`;
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

// Same idea as findFirst, but collects every match anywhere in the tree --
// used for File, since a post could in principle carry more than one even
// though the guide's examples describe a single file's fields.
function findAll(node: unknown, tag: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, tag, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === tag.toLowerCase()) {
      const value = obj[key];
      if (Array.isArray(value)) out.push(...(value as Record<string, unknown>[]));
      else out.push(value as Record<string, unknown>);
    } else {
      findAll(obj[key], tag, out);
    }
  }
  return out;
}

function text(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toDateOrNull(value: string | null): string | null {
  // yyyy-mm-dd per the guide; stored as-is into a `date` column, which
  // rejects anything that doesn't parse rather than silently coercing.
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get("key") ?? "";
  if (providedSecret !== URL_SECRET) {
    console.error("tenstreet-documents-intake: bad or missing key query parameter");
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
    mode: string | null; companyId: string | null; fileId: string | null; leadId: string | null;
    httpStatus: number; status: "ACCEPTED" | "REJECTED"; description: string; outcome: string;
  }) => {
    try {
      const { error: logErr } = await admin.rpc("tenstreet_log_inbound", {
        p_route: "documents", p_source_ip: sourceIp, p_mode: args.mode, p_company_id: args.companyId,
        p_file_id: args.fileId, p_lead_id: args.leadId, p_raw_xml: rawXml, p_http_status: args.httpStatus,
        p_response_status: args.status, p_response_description: args.description,
        p_processing_outcome: args.outcome, p_processing_duration_ms: Date.now() - startedAt, p_key: ENCRYPTION_KEY,
      });
      if (logErr) console.error("tenstreet-documents-intake: failed to write inbound log:", logErr);
    } catch (logErr) {
      console.error("tenstreet-documents-intake: failed to write inbound log:", logErr);
    }
    return xmlResponse(args.status, args.description, args.httpStatus);
  };

  let parsed: unknown;
  try {
    const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
    parsed = parser.parse(rawXml);
  } catch (err) {
    console.error("tenstreet-documents-intake: XML parse failed:", err);
    return await logAndRespond({ mode: null, companyId: null, fileId: null, leadId: null, httpStatus: 200, status: "REJECTED", description: "Malformed XML.", outcome: "rejected_malformed_xml" });
  }

  const mode = text(findFirst(parsed, "Mode"));
  const companyId = text(findFirst(parsed, "CompanyId"));

  if (EXPECTED_COMPANY_ID && companyId && companyId !== EXPECTED_COMPANY_ID) {
    return await logAndRespond({ mode, companyId, fileId: null, leadId: null, httpStatus: 200, status: "REJECTED", description: "Unrecognized Company ID.", outcome: "rejected_wrong_company_id" });
  }

  const ssn = text(findFirst(parsed, "SSN"));
  const ssnLast4 = ssn ? (ssn.replace(/\D/g, "").slice(-4) || null) : null;

  const files = findAll(parsed, "File");
  if (files.length === 0) {
    return await logAndRespond({ mode, companyId, fileId: null, leadId: null, httpStatus: 200, status: "REJECTED", description: "No File node found.", outcome: "rejected_no_file" });
  }

  try {
    // Exactly one matching applicant links the document automatically;
    // zero or multiple leaves it for a recruiter to link by hand.
    let leadId: string | null = null;
    if (ssnLast4) {
      const { data: candidates } = await admin.from("tenstreet_applicant_identity").select("lead_id").eq("ssn_last4", ssnLast4);
      if (candidates && candidates.length === 1) leadId = candidates[0].lead_id as string;
    }

    let firstFileId: string | null = null;
    const results: string[] = [];

    for (const file of files) {
      const fileId = text(findFirst(file, "FileId"));
      const fileCode = text(findFirst(file, "FileCode"));
      const fileCategoryName = text(findFirst(file, "FileCategoryName"));
      const filename = text(findFirst(file, "Filename")) || `tenstreet-file-${crypto.randomUUID()}`;
      const fileType = text(findFirst(file, "FileType")) || "application/octet-stream";
      const statedSize = text(findFirst(file, "FileSize"));
      const dateCreated = toDateOrNull(text(findFirst(file, "DateCreated")));
      const fileExpiration = toDateOrNull(text(findFirst(file, "FileExpiration")));
      const fileDataB64 = text(findFirst(file, "FileData"));

      if (!firstFileId) firstFileId = fileId;

      if (!fileDataB64) {
        results.push(`${fileId ?? "unknown"}: no FileData, skipped`);
        continue;
      }

      let bytes: Uint8Array;
      try {
        const binary = atob(fileDataB64.replace(/\s/g, ""));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } catch (decodeErr) {
        console.error("tenstreet-documents-intake: base64 decode failed for file", fileId, decodeErr);
        results.push(`${fileId ?? "unknown"}: FileData did not decode, skipped`);
        continue;
      }

      if (statedSize && Math.abs(bytes.length - Number(statedSize)) > Math.max(1024, bytes.length * 0.02)) {
        console.error(`tenstreet-documents-intake: decoded size ${bytes.length} doesn't match stated FileSize ${statedSize} for file ${fileId}`);
        // Logged, not rejected -- see header comment.
      }

      const storagePath = `tenstreet/${companyId ?? "unknown-company"}/${fileId ?? crypto.randomUUID()}-${filename}`;
      const { error: uploadErr } = await admin.storage.from("tenstreet-documents").upload(storagePath, bytes, { contentType: fileType, upsert: true });
      if (uploadErr) {
        console.error("tenstreet-documents-intake: storage upload failed for file", fileId, uploadErr);
        results.push(`${fileId ?? "unknown"}: storage upload failed`);
        continue;
      }

      const { error: docErr } = await admin.rpc("tenstreet_upsert_document", {
        p_lead_id: leadId, p_company_id: companyId, p_file_id: fileId, p_ssn: ssn,
        p_file_code: fileCode, p_file_category_name: fileCategoryName, p_filename: filename,
        p_file_type: fileType, p_file_size: bytes.length, p_date_created: dateCreated,
        p_file_expiration: fileExpiration, p_storage_path: storagePath, p_key: ENCRYPTION_KEY,
      });
      if (docErr) {
        console.error("tenstreet-documents-intake: tenstreet_upsert_document failed for file", fileId, docErr);
        results.push(`${fileId ?? "unknown"}: stored but failed to record metadata`);
        continue;
      }

      results.push(`${fileId ?? "unknown"}: stored`);
    }

    const allFailed = results.every((r) => !r.endsWith(": stored"));
    const description = results.join("; ");
    if (allFailed) {
      return await logAndRespond({ mode, companyId, fileId: firstFileId, leadId, httpStatus: 200, status: "REJECTED", description, outcome: "rejected_all_files_failed" });
    }
    return await logAndRespond({ mode, companyId, fileId: firstFileId, leadId, httpStatus: 200, status: "ACCEPTED", description: description || "Document(s) received and stored.", outcome: "stored_documents" });
  } catch (err) {
    console.error("tenstreet-documents-intake: processing failed:", err);
    try {
      await admin.rpc("tenstreet_log_inbound", {
        p_route: "documents", p_source_ip: sourceIp, p_mode: mode, p_company_id: companyId,
        p_file_id: null, p_lead_id: null, p_raw_xml: rawXml, p_http_status: 500,
        p_response_status: "", p_response_description: "", p_processing_outcome: "internal_error",
        p_processing_duration_ms: Date.now() - startedAt, p_key: ENCRYPTION_KEY,
      });
    } catch { /* best-effort -- never let logging itself crash the error path */ }
    return new Response("Internal error", { status: 500 });
  }
});
