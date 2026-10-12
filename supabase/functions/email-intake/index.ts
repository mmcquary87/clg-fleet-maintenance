// Fleet Maintenance System — inbound email receipt intake
//
// Deno Edge Function. NOT invoked by the frontend -- this is a webhook
// target for Mailgun's inbound email routing (set up outside this repo: a
// dedicated subdomain, e.g. receipts@intake.clgdelivers.com, routed to this
// function's URL). Forwarding a roadside/vendor receipt here runs the same
// scan-invoice extraction NewWorkOrderForm's "Scan with AI" button uses,
// then lands a row in inbound_receipts (20261011010000_inbound_receipts.sql)
// for a dispatcher to review in the Receipt Inbox and convert to a real
// work order -- never auto-created, same "human reviews before anything is
// saved" rule scan-invoice itself follows.
//
// Must be deployed with "Enforce JWT verification" turned OFF (Supabase
// dashboard, this function's settings) -- Mailgun has no Supabase user
// session to present. The real security boundary is the Mailgun webhook
// signature check below, not Supabase auth. Requires the MAILGUN_SIGNING_KEY
// secret (Mailgun dashboard -> Sending -> Webhook signing key, account-wide,
// same key for every domain). SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are
// already available to every edge function.
//
// Calls scan-invoice server-to-server with the service role key standing in
// for a user JWT -- same trick pg_cron uses to call samsara-sync (see
// 20260828150000_samsara_sync_schedule.sql) -- since scan-invoice requires a
// valid Supabase JWT (default verify_jwt behavior) and an inbound webhook
// has no user session to borrow one from.
//
// Always returns 200 except on a bad/missing signature: Mailgun retries a
// non-2xx response, and retrying fixes neither a scan-invoice failure nor a
// database error -- those are recorded on the row itself (extraction_error)
// instead, visible to a dispatcher in the Receipt Inbox rather than causing
// a retry storm.
//
// Responds to Mailgun immediately after inserting a placeholder row, then
// does the slow part (storage upload + scan-invoice's Claude call) in a
// background task via EdgeRuntime.waitUntil(), updating that same row when
// it finishes. Mailgun's forward() action times out a webhook response
// after a few seconds -- comfortably shorter than a Claude extraction call
// -- and treats a timeout as a delivery failure worth retrying, which would
// otherwise produce duplicate inbound_receipts rows for one real email.

import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MAILGUN_SIGNING_KEY = Deno.env.get("MAILGUN_SIGNING_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifyMailgunSignature(timestamp: string, token: string, signature: string): Promise<boolean> {
  if (!timestamp || !token || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MAILGUN_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + token));
  const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time-ish compare -- length-gated first (safe, lengths aren't
  // secret), then XOR every byte rather than short-circuiting on mismatch.
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192; // avoid String.fromCharCode(...bytes) blowing the call stack on a large file
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Mailgun gives every inline image referenced in the email body (a
// signature logo, a headshot) its own attachment-N slot alongside real
// attachments -- "content-id-map" is Mailgun's own list of which file names
// are those inline images (JSON dict of content-id -> file name), so this
// skips them rather than grabbing whichever came back as attachment-1 (a
// logo, not the receipt) and handing Claude an image with nothing to extract.
function pickRealAttachment(form: FormData, attachmentCount: number): File | null {
  let inlineFileNames = new Set<string>();
  try {
    const cidMapRaw = form.get("content-id-map")?.toString();
    if (cidMapRaw) inlineFileNames = new Set(Object.values(JSON.parse(cidMapRaw)).map(String));
  } catch {
    // Malformed/missing map -- fall through and treat nothing as inline.
  }
  for (let i = 1; i <= attachmentCount; i++) {
    const att = form.get(`attachment-${i}`);
    if (att instanceof File && !inlineFileNames.has(att.name)) return att;
  }
  // Every attachment looked inline (an unexpected content-id-map shape) --
  // still better to scan something than silently drop a real receipt.
  const first = form.get("attachment-1");
  return first instanceof File ? first : null;
}

async function processAttachment(admin: ReturnType<typeof createClient>, receiptId: string, attachment: File) {
  let storagePath: string | null = null;
  let extracted: unknown = null;
  let extractionError: string | null = null;

  const fileName = attachment.name;
  const mediaType = attachment.type || "application/octet-stream";
  const bytes = new Uint8Array(await attachment.arrayBuffer());

  const path = `email-intake/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadErr } = await admin.storage.from("invoices").upload(path, bytes, { contentType: mediaType });
  if (uploadErr) {
    extractionError = `Couldn't store attachment: ${uploadErr.message}`;
  } else {
    storagePath = path;
    try {
      const scanRes = await fetch(`${SUPABASE_URL}/functions/v1/scan-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ fileBase64: bytesToBase64(bytes), mediaType }),
      });
      const scanJson = await scanRes.json();
      if (!scanRes.ok || scanJson.error) {
        extractionError = scanJson.error || `scan-invoice returned ${scanRes.status}`;
      } else {
        extracted = scanJson;
      }
    } catch (scanErr) {
      extractionError = scanErr instanceof Error ? scanErr.message : "scan-invoice call failed";
    }
  }

  const { error: updateErr } = await admin.from("inbound_receipts")
    .update({ storage_path: storagePath, file_name: fileName, extracted, extraction_error: extractionError })
    .eq("id", receiptId);
  if (updateErr) console.error("email-intake: failed to update inbound_receipts row after extraction:", updateErr);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const form = await req.formData();
    const timestamp = form.get("timestamp")?.toString() ?? "";
    const token = form.get("token")?.toString() ?? "";
    const signature = form.get("signature")?.toString() ?? "";

    if (!(await verifyMailgunSignature(timestamp, token, signature))) {
      console.error("email-intake: signature verification failed");
      return new Response("Forbidden", { status: 403 });
    }

    const fromEmail = form.get("sender")?.toString() || form.get("from")?.toString() || null;
    const subject = form.get("subject")?.toString() || null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const attachmentCount = Number(form.get("attachment-count") || 0);
    // Only the first real (non-inline) attachment -- a roadside/vendor
    // receipt is one document. If someone attaches several, the email
    // itself (sender/subject) is still recorded so nothing vanishes, just
    // with only the first one scanned.
    const attachment = attachmentCount > 0 ? pickRealAttachment(form, attachmentCount) : null;

    // Insert a placeholder row and respond to Mailgun immediately -- the
    // slow part (storage upload + scan-invoice's Claude call) happens in
    // the background below, after Mailgun has already gotten its 200.
    const { data: inserted, error: insertErr } = await admin.from("inbound_receipts")
      .insert({
        from_email: fromEmail,
        subject,
        extraction_error: attachment ? null : "No attachment found in this email.",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("email-intake: failed to insert inbound_receipts row:", insertErr);
      return new Response("OK", { status: 200 });
    }

    if (attachment) {
      EdgeRuntime.waitUntil(
        processAttachment(admin, inserted.id, attachment).catch((err) =>
          console.error("email-intake: background processing failed:", err)
        )
      );
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("email-intake error:", err);
    return new Response("OK", { status: 200 });
  }
});
