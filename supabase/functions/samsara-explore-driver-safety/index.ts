// Fleet Maintenance System — Samsara driver-safety shape discovery probe
// (TEMPORARY)
//
// Building a native "Driver Safety Scorecard" (ported from CLG's own Power
// BI report, which pulled this same data via Samsara's official Power BI
// connector) needs three Samsara data types this codebase hasn't touched
// yet: Safety Events, HOS Violations, and driver-level Fuel/Energy. Only
// /fleet/drivers and /fleet/hos/logs are confirmed shapes in this repo so
// far (samsara-explore-hos, samsara-hos-sync) -- this probes the rest
// against real data before samsara-sync-driver-safety gets built against
// guessed field names.
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

    // One full real driver record -- need every field (createdAtTime?
    // driverActivationStatus is already confirmed from samsara-hos-sync,
    // but the grace-period logic needs a "when was this driver added" date).
    const driversRes = await probe("/fleet/drivers", { limit: "3" });
    results.sampleDrivers = driversRes;
    const sampleDriverId = (driversRes.body as any)?.data?.[0]?.id;

    // Safety Events -- both a legacy and a newer "v2 stream" version are
    // documented as existing; try the plain one first with a date range,
    // since that's the shape most of this codebase's other probes expect.
    results.safetyEvents = await probe("/fleet/safety-events", { startTime: start, endTime: end, limit: "5" });
    results.safetyEventsV2Stream = await probe("/fleet/safety-events/stream", { startTime: start, endTime: end, limit: "5" });

    // HOS Violations -- a distinct concept from /fleet/hos/logs (duty-status
    // segments, already confirmed) and /fleet/hos/clocks (live remaining
    // time, already confirmed) -- neither of those is "a violation
    // occurred." Guessing the plausible path.
    results.hosViolations = await probe("/fleet/hos/violations", { startTime: start, endTime: end, limit: "5" });

    // Driver-level fuel/energy -- /fleet/reports/vehicles/fuel-energy is
    // already confirmed (samsara-fleet-mpg/samsara-miles); the PBI model's
    // "Driver Fuel And Energy" table suggests a driver-scoped sibling.
    results.driverFuelEnergy = await probe("/fleet/reports/drivers/fuel-energy", { startTime: start, endTime: end, limit: "5" });

    if (sampleDriverId) {
      results.sampleDriverIdUsed = sampleDriverId;
      results.safetyEventsByDriver = await probe("/fleet/safety-events", { driverIds: sampleDriverId, startTime: start, endTime: end, limit: "5" });
      results.hosViolationsByDriver = await probe("/fleet/hos/violations", { driverIds: sampleDriverId, startTime: start, endTime: end, limit: "5" });
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
