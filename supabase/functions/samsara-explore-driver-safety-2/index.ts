// Fleet Maintenance System — Samsara driver-safety shape discovery probe,
// round 2 (TEMPORARY)
//
// Round 1 (samsara-explore-driver-safety) confirmed /fleet/safety-events
// and /fleet/hos/violations work as expected -- this round chases the two
// loose ends it found:
//  - /fleet/reports/drivers/fuel-energy 400'd wanting "startDate"/
//    "endDate" (not startTime/endTime like every other endpoint here) --
//    retrying with the right param names.
//  - Speeding never showed up as a /fleet/safety-events behaviorLabel in
//    round 1's sample -- Samsara's own docs describe a dedicated "Get
//    Speeding Intervals" endpoint (severity light/moderate/heavy/severe,
//    postedSpeedLimitKilometersPerHour) as the real source for this,
//    matching the PBI model's "Custom Report - Speeding Events" shape
//    much more closely than safety-events does. Trying the plausible
//    paths since the exact prefix isn't confirmed yet.
//
// Run once via this function's Test button and paste the output back.
//
// Requires SAMSARA_API secret.
//
// Delete this function once samsara-sync-driver-safety is built and confirmed working.

const SAMSARA_BASE = "https://api.samsara.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function authHeaders() {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  return { Authorization: `Bearer ${token}` };
}

async function probe(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${SAMSARA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 1000); }
  return { path, params, status: res.status, ok: res.ok, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const results: Record<string, unknown> = {};

    const todayStr = new Date().toISOString().slice(0, 10);
    const startStr = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

    // Fuel/energy, retried with date-only params
    results.driverFuelEnergyDates = await probe("/fleet/reports/drivers/fuel-energy", { startDate: startStr, endDate: todayStr });

    // Speeding intervals -- trying every plausible path prefix, since the
    // exact one isn't confirmed. A 404 just means "wrong path, try the
    // next"; a 400 naming different required params is still useful
    // signal (means the path is right, params are wrong).
    results.speedingIntervalsFleetPrefixed = await probe("/fleet/speeding-intervals", { startTime: start, endTime: end, limit: "5" });
    results.speedingIntervalsTopLevel = await probe("/speeding-intervals", { startTime: start, endTime: end, limit: "5" });
    results.speedingIntervalsV1 = await probe("/v1/fleet/speeding_intervals", { startMs: String(Date.now() - 14 * 24 * 3600 * 1000), endMs: String(Date.now()) });

    return new Response(JSON.stringify(results, null, 2), {
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
