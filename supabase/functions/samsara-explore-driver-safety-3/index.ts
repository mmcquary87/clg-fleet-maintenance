// Fleet Maintenance System — Samsara driver-safety shape discovery probe,
// round 3 (TEMPORARY)
//
// Round 2 narrowed both loose ends:
//  - /fleet/reports/drivers/fuel-energy's startDate/endDate error changed
//    from "missing" to "could not be parsed using RFC 3339" once passed
//    plain YYYY-MM-DD -- so it wants startDate/endDate as full RFC 3339
//    timestamps (confusing param names, datetime values). Retrying with
//    full timestamps under those same param names.
//  - Samsara's own docs (developers.samsara.com/reference/getspeedingintervals)
//    confirm the real path: GET /speeding-intervals/stream, REQUIRED
//    params assetIds (comma-separated, up to 50) + startTime (RFC 3339),
//    optional endTime. Needs the "Read Speeding Intervals" token scope --
//    if this comes back 401/403, that scope needs adding in the Samsara
//    dashboard (Settings -> API Tokens), same as HOS needed its own scope.
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

    const end = new Date().toISOString();
    const start = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

    // Fuel/energy, retried with full RFC 3339 timestamps under
    // startDate/endDate (the param names the 400 actually asked for).
    results.driverFuelEnergyRfc3339 = await probe("/fleet/reports/drivers/fuel-energy", { startDate: start, endDate: end });

    // Need a real asset (vehicle) id -- speeding-intervals/stream requires
    // assetIds, no "give me everything" option.
    const vehiclesRes = await probe("/fleet/vehicles", { limit: "5" });
    results.sampleVehicles = vehiclesRes;
    const assetIds = ((vehiclesRes.body as any)?.data ?? []).map((v: any) => v.id).slice(0, 5).join(",");

    if (assetIds) {
      results.speedingIntervalsStream = await probe("/speeding-intervals/stream", { assetIds, startTime: start, endTime: end });
    } else {
      results.speedingIntervalsStream = "skipped — no sample vehicle ids found";
    }

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
