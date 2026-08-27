// Fleet Maintenance System — Alvys trips report (Operations Dashboard)
//
// Computes Empty Mile %, On-Time Pickup, On-Time Delivery, Revenue per
// Active Tractor per Week, and Revenue Miles per Active Driver per Week
// directly from Alvys's trips/search endpoint for a given date window.
//
// This supersedes the alvys_loads sync table for those first three KPIs:
// trips/search carries EmptyMileage/LoadedMileage/TotalMileage computed
// by Alvys itself (PCMiler-routed — the same figures behind Alvys's own
// in-app Summary report), plus Truck/Driver1/TripValue, which loads/search
// never exposed. Unlike loads/search, trips/search accepts a real
// date-range filter (PickupDateRange / DeliveryDateRange), so this can
// query live per dashboard request instead of syncing a local table.
//
// PickupDateRange/DeliveryDateRange's exact shape isn't documented
// (Alvys's docs are gated). Confirmed empirically via alvys-explore-trips:
// it's {Start, End} — NOT {Begin, End} (the shape StopWindow uses
// elsewhere in this API, which Alvys silently ignores instead of
// rejecting, making a wrong shape look like success with unfiltered
// data). Start=2030 with End=today produced a real validation error
// ("Pickup start date must be before end date"), confirming Start is a
// real, bound-checked field.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets. Doesn't touch
// our own database at all — pure passthrough/aggregation over Alvys.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES = 40; // safety cap per query, well above what a weekly/monthly window should need

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Terminal-ish statuses that carry real actuals worth counting.
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
  let reportedTotal = 0;
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
    reportedTotal = json.Total;
    items.push(...json.Items);
    if (json.Items.length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return { items, reportedTotal, hitSafetyCap: page >= MAX_PAGES - 1 && items.length < reportedTotal };
}

function firstStopOf(stops: any[], type: string) {
  return (stops ?? []).find((s: any) => s.StopType === type);
}
function lastStopOf(stops: any[], type: string) {
  const matches = (stops ?? []).filter((s: any) => s.StopType === type);
  return matches[matches.length - 1];
}
function isOnTime(arrivedAt: string | undefined, windowEnd: string | undefined, appointmentAt: string | undefined) {
  if (!arrivedAt) return null;
  const deadline = windowEnd || appointmentAt;
  if (!deadline) return null;
  return new Date(arrivedAt).getTime() <= new Date(deadline).getTime();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate (ISO) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getAlvysToken();

    // Trips active during the window from either end (picked up in-range
    // OR delivered in-range) — same basis Samsara's total-miles uses, and
    // matches how Alvys's own Summary report reads "trips this period".
    const [pickedUp, delivered] = await Promise.all([
      fetchAllTrips(token, "PickupDateRange", startDate, endDate),
      fetchAllTrips(token, "DeliveryDateRange", startDate, endDate),
    ]);

    const byId = new Map<string, any>();
    for (const t of [...pickedUp.items, ...delivered.items]) byId.set(t.Id, t);
    const trips = [...byId.values()];

    let totalEmptyMiles = 0;
    let totalLoadedMiles = 0;
    let totalMiles = 0;

    const pickupOnTime: boolean[] = [];
    const deliveryOnTime: boolean[] = [];

    const perTruck = new Map<string, { revenue: number; loadedMiles: number; trips: number }>();
    const perDriver = new Map<string, { revenue: number; loadedMiles: number; trips: number; fleetName: string }>();

    for (const t of trips) {
      totalEmptyMiles += t.EmptyMileage?.Distance?.Value ?? 0;
      totalLoadedMiles += t.LoadedMileage?.Distance?.Value ?? 0;
      totalMiles += t.TotalMileage?.Distance?.Value ?? 0;

      const stops = t.Stops ?? [];
      const pickup = firstStopOf(stops, "Pickup");
      const delivery = lastStopOf(stops, "Delivery");
      const pickupOk = isOnTime(pickup?.ArrivedAt, pickup?.StopWindow?.End, pickup?.AppointmentDate);
      const deliveryOk = isOnTime(delivery?.ArrivedAt, delivery?.StopWindow?.End, delivery?.AppointmentDate);
      if (pickupOk !== null) pickupOnTime.push(pickupOk);
      if (deliveryOk !== null) deliveryOnTime.push(deliveryOk);

      const revenue = t.TripValue?.Amount ?? 0;
      const loadedMiles = t.LoadedMileage?.Distance?.Value ?? 0;
      const truckId = t.Truck?.Id;
      if (truckId) {
        const cur = perTruck.get(truckId) ?? { revenue: 0, loadedMiles: 0, trips: 0 };
        cur.revenue += revenue; cur.loadedMiles += loadedMiles; cur.trips += 1;
        perTruck.set(truckId, cur);
      }
      const driverId = t.Driver1?.Id;
      if (driverId) {
        // Alvys tags each trip with the driver's operating Fleet (e.g.
        // "long haul") — that's the segment CLG actually uses for
        // local/regional/OTR-style breakdowns, so group by whatever
        // fleet names are really configured rather than assuming a
        // fixed Local/Regional/Super Regional/OTR set.
        const fleetName = t.Driver1?.Fleet?.Name?.trim() || "Unassigned";
        const cur = perDriver.get(driverId) ?? { revenue: 0, loadedMiles: 0, trips: 0, fleetName };
        cur.revenue += revenue; cur.loadedMiles += loadedMiles; cur.trips += 1;
        perDriver.set(driverId, cur);
      }
    }

    const truckCount = perTruck.size;
    const driverCount = perDriver.size;
    const totalRevenue = [...perTruck.values()].reduce((s, v) => s + v.revenue, 0);
    const totalDriverLoadedMiles = [...perDriver.values()].reduce((s, v) => s + v.loadedMiles, 0);

    // Revenue per Active Tractor and Revenue Miles per Active Driver are
    // both explicitly "per Week" in the framework — normalize whatever
    // period was actually selected (a day, a week, a month, a quarter)
    // down to a weekly rate, rather than reporting the raw period total
    // under a "per week" label.
    const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    const weeks = days / 7;

    // Revenue Miles per Active Driver, broken out by driver Fleet segment
    // (whatever CLG actually named their fleets in Alvys — e.g. "long
    // haul" — not a hardcoded Local/Regional/Super Regional/OTR set).
    const byFleet = new Map<string, { loadedMiles: number; drivers: Set<string> }>();
    for (const [driverId, d] of perDriver) {
      const cur = byFleet.get(d.fleetName) ?? { loadedMiles: 0, drivers: new Set<string>() };
      cur.loadedMiles += d.loadedMiles;
      cur.drivers.add(driverId);
      byFleet.set(d.fleetName, cur);
    }
    const revenueMilesByFleet = [...byFleet.entries()]
      .map(([fleetName, v]) => ({
        fleetName,
        activeDrivers: v.drivers.size,
        revenueMilesPerActiveDriverPerWeek: Math.round(v.loadedMiles / v.drivers.size / weeks),
      }))
      .sort((a, b) => b.activeDrivers - a.activeDrivers);

    return new Response(JSON.stringify({
      tripsConsidered: trips.length,
      diagnostics: {
        pickupSearchReportedTotal: pickedUp.reportedTotal,
        pickupSearchFetched: pickedUp.items.length,
        pickupSearchHitSafetyCap: pickedUp.hitSafetyCap,
        deliverySearchReportedTotal: delivered.reportedTotal,
        deliverySearchFetched: delivered.items.length,
        deliverySearchHitSafetyCap: delivered.hitSafetyCap,
      },
      totalEmptyMiles: Math.round(totalEmptyMiles),
      totalLoadedMiles: Math.round(totalLoadedMiles),
      totalMiles: Math.round(totalMiles),
      emptyMilePct: totalMiles > 0 ? Math.round((totalEmptyMiles / totalMiles) * 1000) / 10 : null,
      eligiblePickups: pickupOnTime.length,
      onTimePickupPct: pickupOnTime.length > 0 ? Math.round((pickupOnTime.filter(Boolean).length / pickupOnTime.length) * 1000) / 10 : null,
      eligibleDeliveries: deliveryOnTime.length,
      onTimeDeliveryPct: deliveryOnTime.length > 0 ? Math.round((deliveryOnTime.filter(Boolean).length / deliveryOnTime.length) * 1000) / 10 : null,
      revenuePerActiveTractorPerWeek: truckCount > 0 ? Math.round((totalRevenue / truckCount / weeks) * 100) / 100 : null,
      activeTractors: truckCount,
      revenueMilesPerActiveDriverPerWeek: driverCount > 0 ? Math.round(totalDriverLoadedMiles / driverCount / weeks) : null,
      activeDrivers: driverCount,
      revenueMilesByFleet,
      periodWeeks: Math.round(weeks * 100) / 100,
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
