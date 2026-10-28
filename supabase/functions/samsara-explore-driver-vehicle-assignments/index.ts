// Fleet Maintenance System — Driver-Vehicle Assignments API probe (TEMPORARY)
//
// Confirms Samsara's /fleet/driver-vehicle-assignments API (GET + POST)
// actually works the way the public docs describe before building the real
// auto-sync job on top of it (Alvys dispatch -> Samsara assignment, and
// eventually time-aware Speeding attribution instead of the single static
// field). Same spirit as samsara-explore-driver-safety rounds 1-3: run
// once via this function's Test button, read the real response back,
// adjust the real sync code to match.
//
// The POST half doubles as the actual fix Alberto Avila needs (he's
// confirmed driving unit 8619, which had no Static Assigned Driver set in
// Samsara, 2026-10-28) -- rather than posting throwaway test data, this
// creates the one real assignment we already know is correct.
//
// Requires SAMSARA_API secret. The GET should work with the existing
// read-only token; the POST requires the "Write Assignments" scope added
// to that token in Samsara's dashboard (Settings -> API Tokens) -- if that
// scope is missing, the POST will come back 401/403 and this function
// reports that explicitly rather than just failing silently.
//
// Delete this function once the real auto-sync job is built and confirmed
// working against real data.

const SAMSARA_BASE = "https://api.samsara.com";

// Alberto Avila (confirmed driving unit 8619, which had no Static Assigned
// Driver -- 2026-10-28).
const TEST_SAMSARA_DRIVER_ID = "51924473";
const TEST_SAMSARA_VEHICLE_ID = "281474998226201"; // unit 8619

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

async function probe(method: "GET" | "POST", path: string, params?: Record<string, string>, body?: unknown) {
  const url = new URL(`${SAMSARA_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 1000); }

  let scopeNote: string | null = null;
  if (res.status === 401 || res.status === 403) {
    scopeNote = "401/403 -- likely missing the \"Write Assignments\" scope on the SAMSARA_API token (Samsara dashboard -> Settings -> API Tokens). The GET half doesn't need this scope; only POST/PATCH/DELETE on this endpoint do.";
  }

  return { method, path, params, status: res.status, ok: res.ok, scopeNote, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const results: Record<string, unknown> = {};

    // 1. GET -- confirm the read shape and see if any assignment already
    // exists for this vehicle (expected: none, matching the audit's
    // "vehiclesWithNoDriverAssigned" finding for 8619).
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    results.getByVehicle = await probe("GET", "/fleet/driver-vehicle-assignments", {
      filterBy: "vehicles",
      vehicleIds: TEST_SAMSARA_VEHICLE_ID,
      startTime: since.toISOString(),
      endTime: now.toISOString(),
    });

    // 2. POST -- create the real assignment Alberto needs (not throwaway
    // test data). startTime omitted so it defaults to "now" per the docs.
    results.createAssignment = await probe("POST", "/fleet/driver-vehicle-assignments", undefined, {
      driverId: TEST_SAMSARA_DRIVER_ID,
      vehicleId: TEST_SAMSARA_VEHICLE_ID,
    });

    // 3. GET again -- confirm the new assignment shows up, and capture the
    // exact shape of a real assignment record (id field name, etc.) for
    // the real auto-sync job to parse.
    results.getByVehicleAfterCreate = await probe("GET", "/fleet/driver-vehicle-assignments", {
      filterBy: "vehicles",
      vehicleIds: TEST_SAMSARA_VEHICLE_ID,
      startTime: since.toISOString(),
      endTime: new Date(now.getTime() + 60 * 1000).toISOString(),
    });

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
