// Fleet Maintenance System — Samsara Hours of Service shape discovery
// probe (TEMPORARY)
//
// The Tracking page needs each driver's remaining drive/shift/cycle time
// to flag loads at risk of an HOS-forced stop before arrival. Samsara's
// HOS API isn't used anywhere else in this codebase yet, so this probe
// hits the plausible endpoints against a real driver/vehicle from this
// account and dumps the raw response — run it once via this function's
// Test button in the Supabase dashboard and paste the output back so the
// real samsara-hos-sync function can be built against the confirmed
// shape, instead of guessing field names.
//
// Requires SAMSARA_API secret (same token as samsara-sync). If the token's
// scopes don't include "Read Hours of Service", expect 401/403s below —
// that scope needs adding in the Samsara dashboard (Settings -> API
// Tokens) before HOS data can be pulled at all.
//
// Delete this function once samsara-hos-sync is built and confirmed working.

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

async function probe(path: string) {
  const res = await fetch(`${SAMSARA_BASE}${path}`, { headers: authHeaders() });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 1000); }
  return { path, status: res.status, ok: res.ok, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const results: Record<string, unknown> = {};

    // Grab one real driver and one real vehicle to filter the HOS
    // candidates by — several Samsara endpoints 400 without an id filter.
    const driversRes = await probe("/fleet/drivers?limit=5");
    results.sampleDrivers = driversRes;
    const sampleDriverId = (driversRes.body as any)?.data?.[0]?.id;

    const vehiclesRes = await probe("/fleet/vehicles?limit=5");
    const sampleVehicleId = (vehiclesRes.body as any)?.data?.[0]?.id;
    results.sampleVehicleId = sampleVehicleId;

    if (sampleDriverId) {
      results.hosClocksByDriver = await probe(`/fleet/hos/clocks?driverIds=${sampleDriverId}`);
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      results.hosLogsByDriver = await probe(
        `/fleet/hos/logs?driverIds=${sampleDriverId}&startTime=${start}&endTime=${end}`,
      );
    } else {
      results.hosClocksByDriver = "skipped — no sample driver id found";
      results.hosLogsByDriver = "skipped — no sample driver id found";
    }

    if (sampleVehicleId) {
      results.hosClocksByVehicle = await probe(`/fleet/hos/clocks?vehicleIds=${sampleVehicleId}`);
    } else {
      results.hosClocksByVehicle = "skipped — no sample vehicle id found";
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
