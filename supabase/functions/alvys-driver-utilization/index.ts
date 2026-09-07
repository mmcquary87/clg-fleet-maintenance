// Fleet Maintenance System — KPI 11: Driver Utilization
//
// Formula (framework): Available driver-days meeting the approved minimum
// productive-use standard ÷ total available driver-days × 100.
//
// "Available driver-days" comes from our own governed driver_roster table
// (20260828100000_driver_roster.sql) — an EXCEPTION list, not a full
// schedule: a driver with no row is available every day, same as
// web/src/lib/rosterStatus.js reads it. Denominator = every active driver
// in our `drivers` directory (synced from Alvys, see
// 20260828120000_drivers.sql) × every day in the window, minus any day a
// matching roster row marks that driver unavailable (eligibility "Not
// Eligible" is a hard block on every date; a start_date/end_date window
// blocks just those dates — mirrors rosterStatus.js's per-row logic
// exactly, applied across all rows in case a driver ever has more than
// one).
//
// "Productive" comes from Alvys trips/search — trips/search's Driver1.Id
// is the same identifier space as our drivers.id (confirmed by
// alvys-trips-report and home-time-adherence already relying on this), so
// this never needs to name-match a driver against Alvys. Only the roster
// side needs name-matching, since driver_roster is a free-text
// driver_name field, not a driver_id FK — any roster name that doesn't
// match a drivers.name (trimmed, case-insensitive) is reported back
// separately rather than silently dropped, same pattern as
// useMilesDriven's unmatchedTruckSample.
//
// A trip's "worked days" are every UTC calendar day between its earliest
// stop arrival and its latest stop departure (falls back to
// PickedUpAt/PickupDate and DeliveredAt/ScheduledDeliveryAt/DeliveryDate
// when no stop timestamps are present) — day-level bucketing of the same
// per-stop data alvys-trips-report already pulls for detention math,
// analogous to samsara-drive-hour-utilization's addDrivingHoursByDay but
// at day granularity. The Alvys search window is padded beyond
// startDate/endDate so a multi-day haul that started before, or ends
// after, the report window still gets its in-window days counted; worked
// days outside the window are clipped off before counting.
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
        Page: page, PageSize: PAGE_SIZE, Status: RELEVANT_STATUSES,
        [dateRangeField]: { Start: begin, End: end },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`trips/search (${dateRangeField}) page ${page} failed (${res.status}): ${text}`);
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

// Every UTC calendar day a trip actually occupied, from its earliest stop
// arrival to its latest stop departure — falls back to
// PickedUpAt/PickupDate and DeliveredAt/ScheduledDeliveryAt/DeliveryDate
// when no stop timestamps exist (same fallback chain home-time-adherence
// uses for the same reason: not every trip has real stop actuals yet).
function tripDayRange(t: any): { start: string; end: string } | null {
  const stops = t.Stops ?? [];
  const timestamps = stops.flatMap((s: any) => [s.ArrivedAt, s.DepartedAt]).filter(Boolean);
  if (timestamps.length > 0) {
    const sorted = timestamps.map((ts: string) => new Date(ts).getTime()).sort((a: number, b: number) => a - b);
    return { start: new Date(sorted[0]).toISOString().slice(0, 10), end: new Date(sorted[sorted.length - 1]).toISOString().slice(0, 10) };
  }
  const start = (t.PickedUpAt || t.PickupDate || "").slice(0, 10);
  const end = (t.DeliveredAt || t.ScheduledDeliveryAt || t.DeliveryDate || start).slice(0, 10);
  if (!start) return null;
  return { start, end: end || start };
}

function daysBetweenClipped(start: string, end: string, clipStart: string, clipEnd: string): string[] {
  const from = start < clipStart ? clipStart : start;
  const to = end > clipEnd ? clipEnd : end;
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
        driverUtilizationPct: null, availableDriverDays: 0, productiveDriverDays: 0,
        driversConsidered: 0, rosterExceptionRows: (rosterRows ?? []).length,
        unmatchedRosterNames: [], unmatchedRosterNameCount: 0, periodDays: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Roster rows grouped by normalized name — a driver can (in principle)
    // carry more than one row, so unavailability is the union across all
    // of that name's rows, same as rosterStatus.js applied per-row.
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

    // All calendar days in the requested window.
    const windowDays: string[] = [];
    for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) windowDays.push(cursor);

    let availableDriverDays = 0;
    const availableDaySet = new Set<string>(); // `${driverId}|${date}`, only ones actually available
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
    const [pickedUp, delivered] = await Promise.all([
      fetchAllTrips(token, "PickupDateRange", paddedStart, paddedEnd),
      fetchAllTrips(token, "DeliveryDateRange", paddedStart, paddedEnd),
    ]);
    const byId = new Map<string, any>();
    for (const t of [...pickedUp, ...delivered]) byId.set(t.Id, t);
    const trips = [...byId.values()];

    const activeDriverIds = new Set(activeDrivers.map((d) => d.id));
    const productiveDaySet = new Set<string>(); // `${driverId}|${date}`, only in-window worked days
    let tripsWithUsableDates = 0;
    for (const t of trips) {
      const driverId = t.Driver1?.Id;
      if (!driverId || !activeDriverIds.has(driverId)) continue;
      const range = tripDayRange(t);
      if (!range) continue;
      tripsWithUsableDates += 1;
      for (const day of daysBetweenClipped(range.start, range.end, startDate, endDate)) {
        productiveDaySet.add(`${driverId}|${day}`);
      }
    }

    let productiveDriverDays = 0;
    for (const key of productiveDaySet) {
      if (availableDaySet.has(key)) productiveDriverDays += 1;
    }

    return new Response(JSON.stringify({
      driverUtilizationPct: availableDriverDays > 0 ? Math.round((productiveDriverDays / availableDriverDays) * 1000) / 10 : null,
      availableDriverDays,
      productiveDriverDays,
      driversConsidered: activeDrivers.length,
      rosterExceptionRows: (rosterRows ?? []).length,
      unmatchedRosterNames: unmatchedRosterNames.slice(0, 20),
      unmatchedRosterNameCount: unmatchedRosterNames.length,
      periodDays: windowDays.length,
      diagnostics: {
        tripsFetched: trips.length,
        tripsWithUsableDates,
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
