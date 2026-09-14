// Fleet Maintenance System — KPI 4: Planned Driver Capacity Utilization
//
// Framework formula: Planned productive driving capacity assigned to
// revenue work ÷ realistically available productive driving capacity ×
// 100. The framework's own examples of this KPI are hours-based, but
// confirmed via alvys-explore-trip-duration (2026-09-14) that Alvys's
// trips/search never exposes a planned drive-time/duration field on a
// trip -- only distance (Empty/Loaded/TotalMileage). Rather than fabricate
// an "assume N mph" conversion from miles to hours, this is built at
// day-level granularity instead -- the same "capacity" concept KPI 11
// already uses (available driver-days from the governed driver_roster ×
// productive driver-days), applied to PLANNED trips instead of completed
// ones. This is a scope-narrowed proxy for the framework's stated formula,
// not a literal implementation of it -- flagged here, not hidden.
//
// "Available driver-days" -- identical to alvys-driver-utilization (KPI
// 11): every active driver in our `drivers` directory × every day in the
// window, minus any day a driver_roster row marks that driver unavailable.
//
// "Planned productive days" -- every day a driver has a trip PLANNED to
// touch it, regardless of that trip's current status (Cancelled excluded)
// -- mirrors alvys-trips-report's plannedEmptyMilePct methodology (KPI 3),
// which also counts any non-Cancelled trip in the pickup window as
// "planned" rather than restricting to completed/terminal statuses. Day
// range comes ONLY from scheduled/target fields (PickupDate, DeliveryDate)
// -- deliberately NOT from Stops' ArrivedAt/DepartedAt actuals the way KPI
// 11's tripDayRange falls back to, since this KPI measures the plan, not
// what actually happened to it. Confirmed via alvys-explore-trip-duration's
// real trip dump (2026-09-14) that PickupDate/DeliveryDate exist on every
// trip regardless of status; ScheduledDeliveryAt (referenced as a fallback
// by alvys-driver-utilization/home-time-adherence) does NOT appear on the
// live trips/search response at all -- harmless there since DeliveryDate
// covers it, but not claimed as a real field here.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role
// (to read our own drivers/driver_roster tables).

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES = 40;
const SEARCH_PAD_DAYS = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

// statuses = null fetches every trip regardless of status (matches
// alvys-trips-report's plannedPickups call) -- "planned" work isn't
// restricted to trips that have since completed.
async function fetchAllTrips(token: string, begin: string, end: string) {
  const items: any[] = [];
  let page = 0;
  while (page < MAX_PAGES) {
    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, PickupDateRange: { Start: begin, End: end } }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`trips/search page ${page} failed (${res.status}): ${text}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`trips/search page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    if (!Array.isArray(json.Items)) throw new Error(`trips/search page ${page} unexpected shape: ${text.slice(0, 500)}`);
    items.push(...json.Items);
    if (json.Items.length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return items;
}

function toDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00Z");
}
function toStr(date: Date) {
  return date.toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number) {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toStr(d);
}

// Planned day range -- scheduled fields only, no actual-arrival fallback.
// A trip with neither a usable pickup nor delivery target is skipped
// entirely rather than guessing a single day.
function plannedTripDayRange(t: any): { start: string; end: string } | null {
  const start = (t.PickupDate || "").slice(0, 10);
  const end = (t.DeliveryDate || start).slice(0, 10);
  if (!start) return null;
  return { start, end: end || start };
}

function daysBetweenClipped(start: string, end: string, clipStart: string, clipEnd: string): string[] {
  const from = start < clipStart ? clipStart : start;
  const to = end > clipEnd ? clipEnd : end;
  if (from > to) return [];
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function normalizeName(name: string) {
  return (name ?? "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate (YYYY-MM-DD) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: drivers, error: driversErr }, { data: rosterRows, error: rosterErr }] = await Promise.all([
      supabase.from("drivers").select("id, name").eq("is_active", true),
      supabase.from("driver_roster").select("driver_name, eligibility, start_date, end_date"),
    ]);
    if (driversErr) throw driversErr;
    if (rosterErr) throw rosterErr;

    const activeDrivers = drivers ?? [];
    if (activeDrivers.length === 0) {
      return new Response(JSON.stringify({
        plannedCapacityUtilizationPct: null, availableDriverDays: 0, plannedDriverDays: 0,
        driversConsidered: 0, rosterExceptionRows: (rosterRows ?? []).length,
        unmatchedRosterNames: [], unmatchedRosterNameCount: 0, periodDays: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rosterByName = new Map<string, { eligibility: string; start_date: string | null; end_date: string | null }[]>();
    const rosterDisplayNameByKey = new Map<string, string>();
    for (const r of rosterRows ?? []) {
      const key = normalizeName(r.driver_name);
      if (!key) continue;
      const arr = rosterByName.get(key) ?? [];
      arr.push(r);
      rosterByName.set(key, arr);
      if (!rosterDisplayNameByKey.has(key)) rosterDisplayNameByKey.set(key, r.driver_name);
    }

    const driverNameKeys = new Set(activeDrivers.map((d) => normalizeName(d.name)));
    const unmatchedRosterNames = [...rosterByName.keys()]
      .filter((key) => !driverNameKeys.has(key))
      .map((key) => rosterDisplayNameByKey.get(key)!);

    function isUnavailable(driverName: string, dateStr: string): boolean {
      const rows = rosterByName.get(normalizeName(driverName));
      if (!rows) return false;
      return rows.some((r) => {
        if (r.eligibility === "Not Eligible") return true;
        return !!r.start_date && !!r.end_date && r.start_date <= dateStr && dateStr <= r.end_date;
      });
    }

    const windowDays: string[] = [];
    for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) windowDays.push(cursor);

    let availableDriverDays = 0;
    const availableDaySet = new Set<string>();
    for (const d of activeDrivers) {
      for (const day of windowDays) {
        if (isUnavailable(d.name, day)) continue;
        availableDriverDays += 1;
        availableDaySet.add(`${d.id}|${day}`);
      }
    }

    const paddedStart = addDays(startDate, -SEARCH_PAD_DAYS);
    const paddedEnd = addDays(endDate, SEARCH_PAD_DAYS);
    const token = await getAlvysToken();
    const trips = await fetchAllTrips(token, paddedStart, paddedEnd);

    const activeDriverIds = new Set(activeDrivers.map((d) => d.id));
    const plannedDaySet = new Set<string>();
    let tripsWithUsableDates = 0;
    let cancelledSkipped = 0;
    for (const t of trips) {
      if (t.Status === "Cancelled") { cancelledSkipped += 1; continue; }
      const driverId = t.Driver1?.Id;
      if (!driverId || !activeDriverIds.has(driverId)) continue;
      const range = plannedTripDayRange(t);
      if (!range) continue;
      tripsWithUsableDates += 1;
      for (const day of daysBetweenClipped(range.start, range.end, startDate, endDate)) {
        plannedDaySet.add(`${driverId}|${day}`);
      }
    }

    let plannedDriverDays = 0;
    for (const key of plannedDaySet) {
      if (availableDaySet.has(key)) plannedDriverDays += 1;
    }

    return new Response(JSON.stringify({
      plannedCapacityUtilizationPct: availableDriverDays > 0 ? Math.round((plannedDriverDays / availableDriverDays) * 1000) / 10 : null,
      availableDriverDays,
      plannedDriverDays,
      driversConsidered: activeDrivers.length,
      rosterExceptionRows: (rosterRows ?? []).length,
      unmatchedRosterNames: unmatchedRosterNames.slice(0, 20),
      unmatchedRosterNameCount: unmatchedRosterNames.length,
      periodDays: windowDays.length,
      diagnostics: {
        tripsFetched: trips.length,
        tripsWithUsableDates,
        cancelledSkipped,
        searchWindow: { start: paddedStart, end: paddedEnd },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
