// Owner-Operator Recruiting — FMCSA QCMobile API discovery probe (TEMPORARY)
//
// The recruiting handover doc (RECRUITING.md) calls for a "FMCSA client
// that pulls carriers by MC/DOT with authority date, power units, and
// safety data" -- but this environment's network egress blocks fetching
// FMCSA's own API docs (mobile.fmcsa.dot.gov, and every mirror tried, are
// all blocked), so the exact JSON field names below are reconstructed
// from general knowledge of the QCMobile API's long-stable public shape,
// NOT verified against a live response. Same "explore before wiring in
// for real" discipline used for Alvys/Samsara elsewhere in this repo --
// this probe hits the real endpoints with a real DOT/MC number and
// returns the raw response so the actual field names can be confirmed
// (or corrected) before the real import function trusts them.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {"dotNumber": "<a real USDOT
// number>"} and/or {"mcNumber": "<a real MC number>"}) and paste the
// output back. Requires FMCSA_WEB_KEY secret (free, see
// https://mobile.fmcsa.dot.gov/QCDevsite/docs/apiAccess -- request one if
// not already set). Doesn't write anything. Delete once the real shape
// is confirmed and wired into a real fmcsa-import function.

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function tryEndpoint(label: string, path: string, webKey: string) {
  try {
    const url = new URL(`${FMCSA_BASE}${path}`);
    url.searchParams.set("webKey", webKey);
    const res = await fetch(url);
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* leave as raw text */ }
    return { label, status: res.status, ok: res.ok, body: typeof body === "string" ? body.slice(0, 2000) : body };
  } catch (err) {
    return { label, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const webKey = Deno.env.get("FMCSA_WEB_KEY");
    if (!webKey) throw new Error("FMCSA_WEB_KEY secret not set");

    const { dotNumber, mcNumber } = await req.json().catch(() => ({}));
    if (!dotNumber && !mcNumber) {
      throw new Error('Body must include "dotNumber" and/or "mcNumber" (a real one -- this hits the live FMCSA API)');
    }

    const attempts = await Promise.all([
      dotNumber ? tryEndpoint(`GET /carriers/${dotNumber}`, `/carriers/${dotNumber}`, webKey) : null,
      // The base carrier snapshot has no authority-granted date and no MC
      // number directly -- both are confirmed (2026-09-27, DOT 2516954) to
      // live behind these two sub-resources instead, per that response's
      // own _links.
      dotNumber ? tryEndpoint(`GET /carriers/${dotNumber}/authority`, `/carriers/${dotNumber}/authority`, webKey) : null,
      dotNumber ? tryEndpoint(`GET /carriers/${dotNumber}/docket-numbers`, `/carriers/${dotNumber}/docket-numbers`, webKey) : null,
      mcNumber ? tryEndpoint(`GET /carriers/docket-number/${mcNumber}`, `/carriers/docket-number/${mcNumber}`, webKey) : null,
    ]);

    return new Response(JSON.stringify({ attempts: attempts.filter(Boolean) }, null, 2), {
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
