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

// Hours a driver can spend at a stop before it counts as detention —
// confirmed by CLG (2026-08-27) as their standard free-time policy.
// KPI 16 still shows "Pending" on the dashboard, not because this
// number is in question, but because the framework's Green/Yellow/Red
// target values (not just the free-time definition) haven't been set.
const FREE_TIME_HOURS = 2;

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

async function fetchAllTrips(token: string, dateRangeField: "PickupDateRange" | "DeliveryDateRange", begin: string, end: string, statuses: string[] | null = RELEVANT_STATUSES) {
  const items: any[] = [];
  let page = 0;
  let reportedTotal = 0;
  while (page < MAX_PAGES) {
    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        Page: page, PageSize: PAGE_SIZE,
        ...(statuses ? { Status: statuses } : {}),
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
function isOnTime(arrivedAt: string | undefined, deadline: string | undefined | null) {
  if (!arrivedAt || !deadline) return null;
  return new Date(arrivedAt).getTime() <= new Date(deadline).getTime();
}

function addBusinessDays(iso: string, days: number): string {
  const result = new Date(iso);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) added += 1;
  }
  return result.toISOString();
}

// KBX Logistics' CustomerId, confirmed via alvys-explore-kbx-transfer-type
// (2026-08-30) -- CustomerName "KBX Logistics", CustomerNumber "KBXLELTX".
// Used to fetch just KBX's loads via loads/search's CustomerId filter
// instead of scanning every customer's loads (Completed alone runs
// 10,000+ company-wide, confirmed via the same probe).
const KBX_CUSTOMER_ID = "5a3c2a3baca846b0b788d1f926235244";

// CLG's on-time delivery scoring for KBX gives some loads a grace period
// plain StopWindow/AppointmentDate can't capture: a load noted "DEMAND
// TRANSFER" is due on the stated date, but one noted "RELIEF TRANSFER"
// gets up to 2 business days after that date before it counts against the
// scorecard. This designation lives as free text in the load's Notes, not
// a structured field (confirmed via the probe) -- so this matches whatever
// note text contains "relief transfer" / "demand transfer",
// case-insensitively. A KBX load with neither phrase in its notes defaults
// to strict/demand (no grace) -- the conservative read, since there's no
// positive signal a grace period applies.
async function fetchKbxTransferTypes(token: string): Promise<Map<string, "relief" | "demand">> {
  // Looped one status at a time, matching the shape alvys-sync-loads and
  // alvys-explore-kbx-transfer-type already confirmed works against
  // loads/search -- Alvys silently ignores an unsupported param shape
  // instead of rejecting it (same trap PickupDateRange's {Start,End} vs
  // {Begin,End} hit elsewhere in this file), so a multi-status array here
  // is an untested assumption not worth risking on a real KPI.
  const MAX_KBX_PAGES_PER_STATUS = 15;
  const items: any[] = [];
  for (const status of RELEVANT_STATUSES) {
    let page = 0;
    while (page < MAX_KBX_PAGES_PER_STATUS) {
      const res = await fetch(`${ALVYS_API_BASE}/loads/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, Status: [status], CustomerId: KBX_CUSTOMER_ID }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`loads/search (KBX, ${status}) page ${page} failed (${res.status}): ${text.slice(0, 500)}`);
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`loads/search (KBX, ${status}) page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
      items.push(...(json.Items ?? []));
      if ((json.Items ?? []).length === 0 || items.length >= json.Total) break;
      page += 1;
    }
  }
  const byLoadNumber = new Map<string, "relief" | "demand">();
  for (const l of items) {
    const notesText = (l.Notes ?? []).map((n: any) => String(n.Description ?? "")).join(" \n ").toLowerCase();
    if (notesText.includes("relief transfer")) byLoadNumber.set(l.LoadNumber, "relief");
    else if (notesText.includes("demand transfer")) byLoadNumber.set(l.LoadNumber, "demand");
  }
  return byLoadNumber;
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
    //
    // Separately, KPI 3 (Planned Empty Mile %) is a LEADING indicator over
    // the whole book of business planned for pickup this window — not just
    // the terminal-status trips the other KPIs above use, since a load's
    // PCMiler-routed EmptyMileage/TotalMileage is set at planning time and
    // doesn't change whether the load has run yet. No Status filter (Alvys
    // returns every status when it's omitted, confirmed via
    // alvys-explore-active-trips), then Cancelled is excluded client-side
    // since a cancelled load was never actually planned to run.
    const [pickedUp, delivered, plannedPickups, kbxTransferByLoadNumber] = await Promise.all([
      fetchAllTrips(token, "PickupDateRange", startDate, endDate),
      fetchAllTrips(token, "DeliveryDateRange", startDate, endDate),
      fetchAllTrips(token, "PickupDateRange", startDate, endDate, null),
      fetchKbxTransferTypes(token),
    ]);

    const byId = new Map<string, any>();
    for (const t of [...pickedUp.items, ...delivered.items]) byId.set(t.Id, t);
    const trips = [...byId.values()];

    let totalEmptyMiles = 0;
    let totalLoadedMiles = 0;
    let totalMiles = 0;

    const pickupOnTime: boolean[] = [];
    const deliveryOnTime: boolean[] = [];
    let dropHookPickupsExcluded = 0;
    let kbxReliefTransfersApplied = 0;
    let kbxReliefTransfersFlippedToOnTime = 0;
    let kbxDemandTransfers = 0;

    let totalStopHours = 0;
    let totalDetentionHours = 0;
    let stopsWithDwellTime = 0;
    let detentionEvents = 0;
    const liveOrOtherStops = { hours: 0, detentionHours: 0, detentionEvents: 0 };
    const dropHookStops = { hours: 0, detentionHours: 0, detentionEvents: 0 };

    const perTruck = new Map<string, { revenue: number; loadedMiles: number; trips: number }>();
    const perDriver = new Map<string, { revenue: number; loadedMiles: number; trips: number; fleetName: string }>();

    for (const t of trips) {
      totalEmptyMiles += t.EmptyMileage?.Distance?.Value ?? 0;
      totalLoadedMiles += t.LoadedMileage?.Distance?.Value ?? 0;
      totalMiles += t.TotalMileage?.Distance?.Value ?? 0;

      const stops = t.Stops ?? [];
      const pickup = firstStopOf(stops, "Pickup");
      const delivery = lastStopOf(stops, "Delivery");
      const pickupOk = isOnTime(pickup?.ArrivedAt, pickup?.StopWindow?.End || pickup?.AppointmentDate);

      // KBX relief-transfer loads get their delivery deadline pushed 2
      // business days out before judging on-time — see
      // fetchKbxTransferTypes' comment for why. A demand-transfer or
      // untagged KBX load, and every non-KBX load, uses the deadline as-is.
      let deliveryDeadline = delivery?.StopWindow?.End || delivery?.AppointmentDate;
      const kbxTransferType = t.LoadNumber ? kbxTransferByLoadNumber.get(t.LoadNumber) : undefined;
      if (kbxTransferType === "relief" && deliveryDeadline && !deliveryDeadline.startsWith("9999")) {
        const extendedDeadline = addBusinessDays(deliveryDeadline, 2);
        if (isOnTime(delivery?.ArrivedAt, deliveryDeadline) === false && isOnTime(delivery?.ArrivedAt, extendedDeadline) === true) {
          kbxReliefTransfersFlippedToOnTime += 1;
        }
        deliveryDeadline = extendedDeadline;
        kbxReliefTransfersApplied += 1;
      } else if (kbxTransferType === "demand") {
        kbxDemandTransfers += 1;
      }
      const deliveryOk = isOnTime(delivery?.ArrivedAt, deliveryDeadline);
      // A missed Drop&Hook pickup window isn't actually judged against CLG
      // in practice (confirmed by CLG 2026-08-30) — as long as delivery is
      // on time, a late drop&hook pickup doesn't cost anything. Excluded
      // from the eligible-pickup set entirely rather than force-counted as
      // "on time," since it isn't a real on-time judgment either way —
      // counting it as on-time would inflate the score dishonestly.
      if (pickupOk !== null && pickup?.LoadingType !== "Drop&Hook") pickupOnTime.push(pickupOk);
      else if (pickupOk !== null) dropHookPickupsExcluded += 1;
      if (deliveryOk !== null) deliveryOnTime.push(deliveryOk);

      // Waiting + detention: every Pickup/Delivery stop's chargeable dwell
      // time. Not just first-pickup/last-delivery here — a multi-stop load
      // can accumulate detention at any stop.
      //
      // Chargeable wait starts at the LATER of actual arrival and the
      // stop's expected time (StopWindow.Begin for FCFS, AppointmentDate
      // for APPT) — a driver who shows up early and waits for their own
      // window/appointment isn't the facility's fault, so that portion no
      // longer counts toward detention exposure (previously it did,
      // inflating the number and misattributing it).
      //
      // Also split by LoadingType: Drop&Hook should genuinely run near-zero
      // real wait (no live loading crew to wait on), so blending it with
      // Live stops diluted where actual detention was concentrated.
      for (const s of stops) {
        if ((s.StopType !== "Pickup" && s.StopType !== "Delivery") || !s.ArrivedAt || !s.DepartedAt) continue;
        const arrivedAt = new Date(s.ArrivedAt).getTime();
        const departedAt = new Date(s.DepartedAt).getTime();
        const expectedAt = s.StopWindow?.Begin ? new Date(s.StopWindow.Begin).getTime()
          : s.AppointmentDate ? new Date(s.AppointmentDate).getTime()
          : arrivedAt;
        const chargeableStart = Math.max(arrivedAt, expectedAt);
        const dwellHours = (departedAt - chargeableStart) / 3600000;
        if (!(dwellHours > 0) || dwellHours > 48) continue; // guard against bad/missing data
        totalStopHours += dwellHours;
        stopsWithDwellTime += 1;
        let detentionForStop = 0;
        if (dwellHours > FREE_TIME_HOURS) {
          detentionForStop = dwellHours - FREE_TIME_HOURS;
          totalDetentionHours += detentionForStop;
          detentionEvents += 1;
        }
        const bucket = s.LoadingType === "Drop&Hook" ? dropHookStops : liveOrOtherStops;
        bucket.hours += dwellHours;
        bucket.detentionHours += detentionForStop;
        if (detentionForStop > 0) bucket.detentionEvents += 1;
      }

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

    let plannedEmptyMiles = 0;
    let plannedTotalMiles = 0;
    let plannedTripsConsidered = 0;
    for (const t of plannedPickups.items) {
      if (t.Status === "Cancelled") continue;
      plannedEmptyMiles += t.EmptyMileage?.Distance?.Value ?? 0;
      plannedTotalMiles += t.TotalMileage?.Distance?.Value ?? 0;
      plannedTripsConsidered += 1;
    }

    const truckCount = perTruck.size;
    const driverCount = perDriver.size;
    const totalRevenue = [...perTruck.values()].reduce((s, v) => s + v.revenue, 0);
    const totalDriverRevenue = [...perDriver.values()].reduce((s, v) => s + v.revenue, 0);
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
        plannedPickupsSearchReportedTotal: plannedPickups.reportedTotal,
        plannedPickupsSearchFetched: plannedPickups.items.length,
        plannedPickupsSearchHitSafetyCap: plannedPickups.hitSafetyCap,
      },
      totalEmptyMiles: Math.round(totalEmptyMiles),
      totalLoadedMiles: Math.round(totalLoadedMiles),
      totalMiles: Math.round(totalMiles),
      emptyMilePct: totalMiles > 0 ? Math.round((totalEmptyMiles / totalMiles) * 1000) / 10 : null,
      // KPI 3 — Planned Empty Mile % (leading), distinct from KPI 7 above
      // (lagging, terminal-status trips only). See the plannedPickups
      // comment above for why this covers a different trip set.
      plannedTripsConsidered,
      plannedEmptyMiles: Math.round(plannedEmptyMiles),
      plannedTotalMiles: Math.round(plannedTotalMiles),
      plannedEmptyMilePct: plannedTotalMiles > 0 ? Math.round((plannedEmptyMiles / plannedTotalMiles) * 1000) / 10 : null,
      eligiblePickups: pickupOnTime.length,
      dropHookPickupsExcluded,
      onTimePickupPct: pickupOnTime.length > 0 ? Math.round((pickupOnTime.filter(Boolean).length / pickupOnTime.length) * 1000) / 10 : null,
      eligibleDeliveries: deliveryOnTime.length,
      onTimeDeliveryPct: deliveryOnTime.length > 0 ? Math.round((deliveryOnTime.filter(Boolean).length / deliveryOnTime.length) * 1000) / 10 : null,
      // KBX relief/demand transfer designation, pulled from Notes text on
      // KBX's own loads (see fetchKbxTransferTypes) -- kbxReliefTransfersApplied
      // is how many delivery judgments used the extended (+2 business day)
      // deadline; kbxReliefTransfersFlippedToOnTime is how many of those
      // would have shown late under the original deadline but are on-time
      // under the real one.
      kbxLoadsWithTransferTypeFound: kbxTransferByLoadNumber.size,
      kbxReliefTransfersApplied,
      kbxReliefTransfersFlippedToOnTime,
      kbxDemandTransfers,
      revenuePerActiveTractorPerWeek: truckCount > 0 ? Math.round((totalRevenue / truckCount / weeks) * 100) / 100 : null,
      activeTractors: truckCount,
      // Supporting figure alongside Revenue per Active Tractor, not a
      // separate governed KPI — same revenue, divided by the labor asset
      // (driver) instead of the capital asset (tractor), for a quick
      // capital-vs-labor efficiency comparison.
      revenuePerActiveDriverPerWeek: driverCount > 0 ? Math.round((totalDriverRevenue / driverCount / weeks) * 100) / 100 : null,
      revenueMilesPerActiveDriverPerWeek: driverCount > 0 ? Math.round(totalDriverLoadedMiles / driverCount / weeks) : null,
      activeDrivers: driverCount,
      revenueMilesByFleet,
      // KPI 16 — waiting + detention hours per active driver per week.
      // FREE_TIME_HOURS (2h) is CLG's confirmed policy, not a guess —
      // this KPI still shows "Pending" because the framework's
      // Green/Yellow/Red target values haven't been set, not because
      // the free-time number is in doubt. detentionHours is the
      // drill-down split: the portion of stop dwell time beyond it.
      waitingDetentionHoursPerActiveDriverPerWeek: driverCount > 0 ? Math.round((totalStopHours / driverCount / weeks) * 10) / 10 : null,
      detentionHoursPerActiveDriverPerWeek: driverCount > 0 ? Math.round((totalDetentionHours / driverCount / weeks) * 10) / 10 : null,
      stopsWithDwellTime,
      detentionEvents,
      // Detention split by LoadingType — Drop&Hook should read near-zero
      // real wait; Live is where genuine facility-caused detention shows up.
      liveLoadDetentionHoursPerActiveDriverPerWeek: driverCount > 0 ? Math.round((liveOrOtherStops.detentionHours / driverCount / weeks) * 10) / 10 : null,
      liveLoadDetentionEvents: liveOrOtherStops.detentionEvents,
      dropHookDetentionHoursPerActiveDriverPerWeek: driverCount > 0 ? Math.round((dropHookStops.detentionHours / driverCount / weeks) * 10) / 10 : null,
      dropHookDetentionEvents: dropHookStops.detentionEvents,
      freeTimeHoursAssumed: FREE_TIME_HOURS,
      periodWeeks: Math.round(weeks * 100) / 100,
      // Diagnostic for KPI 17 feasibility: does Alvys expose a driver NAME
      // anywhere on the trip, or only the opaque Driver1.Id we already use?
      // If a name field exists here, our roster's free-text driver_name
      // could potentially be matched against it. Remove once answered.
      sampleDriver1: trips.find((t: any) => t.Driver1)?.Driver1 ?? null,
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
