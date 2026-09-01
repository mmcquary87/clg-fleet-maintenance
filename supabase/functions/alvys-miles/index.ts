// Fleet Maintenance System — Alvys-sourced miles driven over a date range
// (for cost/mile). Replaces samsara-miles as the Cost/Mile source.
//
// Per CLG (2026-09-01): Samsara/ELD mileage only covers trucks physically
// integrated with our own telematics hardware. A rented truck (e.g. a
// Penske rental) that isn't wired into our ELD platform reports zero or
// near-zero Samsara mileage even while it's actively hauling loads --
// Alvys's trip data (PCMiler-routed EmptyMileage/LoadedMileage/
// TotalMileage, set at planning time regardless of which physical truck or
// telematics setup ran the load) is the one mileage source that covers
// every truck CLG dispatches, rented or owned, not just Samsara-integrated
// ones.
//
// Confirmed cross-check (2026-09-01, August 2026 window): this method
// (341,476 mi) landed within ~2% of Samsara's own Fleet IFTA MPG dashboard
// (347,972.7 mi), while the old Samsara-based methods (fuel-energy report:
// 239,646 mi; obdOdometerMeters delta: 237,946 mi) both undercounted by
// ~30% -- consistent with a subset of trucks (rentals, or units without
// full engine/ECU integration) that Samsara's engine-dependent metrics
// can't see but Alvys's trip-based mileage doesn't depend on at all.
//
// Same {startTime, endTime} request / {totalMiles, perUnit, ...} response
// shape as the old samsara-miles, so useMilesDriven and the Company Spend /
// By Unit pages needed no changes beyond which function they call.
//
// Matches Alvys trips to our own units via units.alvys_asset_id ==
// trip.Truck.Id (same id space alvys-sync-active-trips already confirmed).
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets. Runs with the
// caller's own auth for our own DB read (respects RLS as normal).

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES = 40; // safety cap per query, well above what a weekly/monthly window should need

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Terminal-ish statuses that carry real actuals worth counting -- same set
// alvys-trips-report uses for its lagging (non-"planned") KPIs.
const RELEVANT_STATUSES = ["Delivered", "Completed", "Invoiced", "Paid"];

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

async function fetchAllTrips(token: string, dateRangeField: "PickupDateRange" | "DeliveryDateRange", begin: string, end: string) {
  const items: any[] = [];
  let page = 0;
  while (page < MAX_PAGES) {
    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        Page: page, PageSize: PAGE_SIZE,
        Status: RELEVANT_STATUSES,
        [dateRangeField]: { Start: begin, End: end },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`trips/search (${dateRangeField}) page ${page} failed (${res.status}): ${text}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`trips/search page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    if (typeof json.Total !== "number" || !Array.isArray(json.Items)) {
      throw new Error(`trips/search page ${page} unexpected shape: ${text.slice(0, 500)}`);
    }
    items.push(...json.Items);
    if (json.Items.length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startTime, endTime } = await req.json();
    if (!startTime || !endTime) {
      return new Response(JSON.stringify({ error: "startTime and endTime (ISO) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the caller's own auth for our DB read (respects RLS as normal).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Active trucks regardless of Alvys match, so the response can show
    // exactly how many are missing alvys_asset_id entirely.
    const { data: allActiveTrucks, error: allTrucksErr } = await supabase
      .from("units").select("id, number, alvys_asset_id").eq("type", "Truck").eq("is_active", true);
    if (allTrucksErr) throw allTrucksErr;
    const unmatchedTrucks = allActiveTrucks.filter((u) => !u.alvys_asset_id).map((u) => u.number);

    const units = allActiveTrucks.filter((u) => u.alvys_asset_id);
    if (units.length === 0) {
      return new Response(JSON.stringify({
        totalMiles: 0, perUnit: [], unitsWithAlvys: 0,
        activeTrucks: allActiveTrucks.length, unmatchedTruckCount: unmatchedTrucks.length, unmatchedTruckSample: unmatchedTrucks.slice(0, 20),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unitByAssetId = new Map(units.map((u: any) => [u.alvys_asset_id, u]));

    const token = await getAlvysToken();

    // Trips active during the window from either end (picked up in-range OR
    // delivered in-range) -- same basis samsara-miles used, and matches how
    // Alvys's own Summary report reads "trips this period".
    const [pickedUp, delivered] = await Promise.all([
      fetchAllTrips(token, "PickupDateRange", startTime, endTime),
      fetchAllTrips(token, "DeliveryDateRange", startTime, endTime),
    ]);
    const byId = new Map<string, any>();
    for (const t of [...pickedUp, ...delivered]) byId.set(t.Id, t);

    const milesByUnitId = new Map<string, number>();
    for (const t of byId.values()) {
      const unit = unitByAssetId.get(t.Truck?.Id);
      if (!unit) continue;
      const miles = t.TotalMileage?.Distance?.Value ?? 0;
      milesByUnitId.set(unit.id, (milesByUnitId.get(unit.id) ?? 0) + miles);
    }

    const perUnit: { unitId: string; unitNumber: string; miles: number }[] = [];
    const matchedButNoData: string[] = [];
    let totalMiles = 0;
    for (const u of units) {
      const miles = milesByUnitId.get(u.id);
      if (miles == null) {
        matchedButNoData.push(u.number);
        continue;
      }
      perUnit.push({ unitId: u.id, unitNumber: u.number, miles: Math.round(miles) });
      totalMiles += miles;
    }

    return new Response(JSON.stringify({
      totalMiles: Math.round(totalMiles),
      perUnit,
      unitsWithAlvys: units.length,
      // matchedButNoData: trucks with an alvys_asset_id but zero
      // Delivered/Completed/Invoiced/Paid trips picked up or delivered in
      // this window -- a real "didn't run this period" gap, not a
      // data-source problem.
      matchedButNoDataCount: matchedButNoData.length,
      matchedButNoDataSample: matchedButNoData.slice(0, 20),
      // Active trucks in our own units table without an alvys_asset_id at
      // all -- these can't be counted here no matter what Alvys returns,
      // since there's nothing to match trips against. This is a gap in
      // this app's own unit-to-Alvys matching, not Alvys's API.
      activeTrucks: allActiveTrucks.length,
      unmatchedTruckCount: unmatchedTrucks.length,
      unmatchedTruckSample: unmatchedTrucks.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === "object" && "message" in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
