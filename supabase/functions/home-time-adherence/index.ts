// Fleet Maintenance System — KPI 17: Driver Schedule Adherence
//
// Formula (framework): Approved home-time events and planned days off
// honored ÷ total approved home-time events and planned days off × 100.
//
// "Planned" comes from our own planned_home_time table (recurring
// schedules, linked to a real Alvys driver via driver_id — confirmed
// trips/search's Driver1.Id and drivers/search's Id are the same
// identifier space). Each planned date lands in one of three buckets:
//   - Violated: the driver was actually assigned to a trip covering it
//     (checked against Alvys trips/search, as before).
//   - Honored: no trip AND a real Alvys driver event (drivers/events/
//     search — EventType Hometime/Restart/Vacation/SickOrEmergency;
//     "Other" excluded, since real account data shows it's mostly used
//     for meetings, not time off) actually covers that date. This is
//     evidence-backed, not inferred.
//   - Unconfirmed: no trip, but no matching event either. Previously this
//     silently counted as "honored" on trip-absence alone — a driver with
//     nothing to do (in the shop, waiting on dispatch) isn't necessarily
//     actually home, so this is now reported separately rather than
//     assumed. adherencePct is honored ÷ total, i.e. Unconfirmed does NOT
//     count toward the percentage — confirmed by CLG (2026-09-01) as a
//     deliberately stricter number than the old trip-absence-only version.
//
// Only planned_home_time rows with a driver_id are eligible — a row
// added via "+ Add a new driver" (not yet synced from Alvys) has no way
// to check real trip/event activity, so it's excluded and reported
// separately rather than silently skipped.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role
// (to read our own planned_home_time table for aggregate reporting).

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const MAX_PAGES = 40;

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

async function fetchAllTrips(token: string, rangeField: string, startDate: string, endDate: string) {
  const items: any[] = [];
  let page = 0;
  while (page < MAX_PAGES) {
    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, [rangeField]: { Start: startDate, End: endDate } }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`trips/search page ${page} failed (${res.status}): ${text}`);
    const json = JSON.parse(text);
    items.push(...json.Items);
    if (json.Items.length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return items;
}

// EventType values confirmed against real account data (alvys-explore-
// driver-events, 2026-09-01): Hometime, Other, Vacation, SickOrEmergency,
// Restart. "Other" excluded — the sample was almost entirely company
// meetings ("Driver Safety Program Launch Meeting"), not time off.
const HOME_EVENT_TYPES = new Set(["Hometime", "Restart", "Vacation", "SickOrEmergency"]);

// drivers/events/search isn't paginated (no Page/PageSize in its request
// schema) — a single call covering every linked driver is enough.
async function fetchDriverEvents(token: string, driverIds: string[], startDate: string, endDate: string) {
  if (driverIds.length === 0) return [];
  const res = await fetch(`${ALVYS_API_BASE}/drivers/events/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ StartDate: startDate, EndDate: endDate, DriverIds: driverIds }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`drivers/events/search failed (${res.status}): ${text}`);
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : (json.Items ?? json.Events ?? []);
}

// --- Same recurrence logic as web/src/lib/homeTimeSchedule.js, ported to
// Deno since edge functions can't import from the web app's source tree.
// Keep in sync if that file changes. ---

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
function nthWeekdayOccurrenceInMonth(date: Date) {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}
function isLastOccurrenceOfWeekdayInMonth(date: Date) {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + 7);
  return next.getUTCMonth() !== date.getUTCMonth();
}
function isHomeOn(schedule: any, dateStr: string): boolean {
  if (dateStr < schedule.effective_start_date) return false;
  if (schedule.effective_end_date && dateStr > schedule.effective_end_date) return false;
  const date = toDate(dateStr);
  const dow = date.getUTCDay();
  if (!schedule.days_of_week.includes(dow)) return false;
  if (schedule.cadence === "weekly") return true;
  if (schedule.cadence === "biweekly") {
    if (!schedule.anchor_date) return false;
    const daysDiff = Math.round((date.getTime() - toDate(schedule.anchor_date).getTime()) / 86400000);
    const weeksDiff = Math.floor(daysDiff / 7);
    return ((weeksDiff % 2) + 2) % 2 === 0;
  }
  if (schedule.cadence === "monthly_nth") {
    if (schedule.month_occurrence === -1) return isLastOccurrenceOfWeekdayInMonth(date);
    return nthWeekdayOccurrenceInMonth(date) === schedule.month_occurrence;
  }
  return false;
}
function occurrencesInRange(schedule: any, rangeStart: string, rangeEnd: string) {
  const dates: string[] = [];
  let cursor = rangeStart > schedule.effective_start_date ? rangeStart : schedule.effective_start_date;
  while (cursor <= rangeEnd) {
    if (isHomeOn(schedule, cursor)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
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

    const { data: schedules, error: schedErr } = await supabase.from("planned_home_time").select("*");
    if (schedErr) throw schedErr;

    const linked = (schedules ?? []).filter((s) => s.driver_id);
    const unlinked = (schedules ?? []).filter((s) => !s.driver_id);

    // Every planned occurrence across all linked schedules in the window.
    const plannedEvents = linked.flatMap((s) =>
      occurrencesInRange(s, startDate, endDate).map((date) => ({ driverId: s.driver_id, driverName: s.driver_name, date }))
    );

    if (plannedEvents.length === 0) {
      return new Response(JSON.stringify({
        totalPlannedEvents: 0, honoredEvents: 0, violatedEvents: 0, unconfirmedEvents: 0, adherencePct: null,
        unlinkedSchedules: unlinked.length,
        violations: [],
        unconfirmed: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pad the search windows so a trip/event that started before the report
    // window but overlaps a planned date at the edge still gets caught.
    const paddedStart = addDays(startDate, -14);
    const paddedEnd = addDays(endDate, 14);
    const token = await getAlvysToken();
    const linkedDriverIds = [...new Set(linked.map((s) => s.driver_id))];
    const [pickedUp, delivered, driverEvents] = await Promise.all([
      fetchAllTrips(token, "PickupDateRange", paddedStart, paddedEnd),
      fetchAllTrips(token, "DeliveryDateRange", paddedStart, paddedEnd),
      fetchDriverEvents(token, linkedDriverIds, `${paddedStart}T00:00:00Z`, `${paddedEnd}T23:59:59Z`),
    ]);
    const byId = new Map<string, any>();
    for (const t of [...pickedUp, ...delivered]) byId.set(t.Id, t);
    const trips = [...byId.values()];

    // Per driver, the date ranges (actual if known, else scheduled) they were on a trip.
    const busyRangesByDriver = new Map<string, { start: string; end: string }[]>();
    for (const t of trips) {
      const driverId = t.Driver1?.Id;
      if (!driverId) continue;
      const start = (t.PickedUpAt || t.PickupDate || "").slice(0, 10);
      const end = (t.DeliveredAt || t.ScheduledDeliveryAt || t.DeliveryDate || start).slice(0, 10);
      if (!start) continue;
      const arr = busyRangesByDriver.get(driverId) ?? [];
      arr.push({ start, end: end || start });
      busyRangesByDriver.set(driverId, arr);
    }

    // Per driver, the date ranges a real Alvys event confirms they were
    // off (Hometime/Restart/Vacation/SickOrEmergency only — see
    // HOME_EVENT_TYPES).
    const homeRangesByDriver = new Map<string, { start: string; end: string }[]>();
    for (const e of driverEvents) {
      if (!HOME_EVENT_TYPES.has(e.EventType) || !e.DriverId) continue;
      const start = (e.StartDate || "").slice(0, 10);
      const end = (e.EndDate || start).slice(0, 10);
      if (!start) continue;
      const arr = homeRangesByDriver.get(e.DriverId) ?? [];
      arr.push({ start, end: end || start });
      homeRangesByDriver.set(e.DriverId, arr);
    }

    const violations: { driverName: string; date: string; tripStart: string; tripEnd: string }[] = [];
    const unconfirmed: { driverName: string; date: string }[] = [];
    let honored = 0;
    for (const ev of plannedEvents) {
      const busyRanges = busyRangesByDriver.get(ev.driverId) ?? [];
      const tripOverlap = busyRanges.find((r) => ev.date >= r.start && ev.date <= r.end);
      if (tripOverlap) {
        violations.push({ driverName: ev.driverName, date: ev.date, tripStart: tripOverlap.start, tripEnd: tripOverlap.end });
        continue;
      }
      const homeRanges = homeRangesByDriver.get(ev.driverId) ?? [];
      const homeOverlap = homeRanges.some((r) => ev.date >= r.start && ev.date <= r.end);
      if (homeOverlap) {
        honored += 1;
      } else {
        unconfirmed.push({ driverName: ev.driverName, date: ev.date });
      }
    }

    return new Response(JSON.stringify({
      totalPlannedEvents: plannedEvents.length,
      honoredEvents: honored,
      violatedEvents: violations.length,
      unconfirmedEvents: unconfirmed.length,
      adherencePct: Math.round((honored / plannedEvents.length) * 1000) / 10,
      unlinkedSchedules: unlinked.length,
      violations: violations.slice(0, 50),
      unconfirmed: unconfirmed.slice(0, 50),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
