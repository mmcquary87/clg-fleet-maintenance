// Fleet Maintenance System — KPI 13: Average Daily Drive-Hour Utilization %
// (Operations Dashboard)
//
// Formula (framework): Productive driving hours ÷ realistically available
// productive driving capacity × 100.
//
// Methodology (CLG, 2026-08-30): "realistically available capacity" is the
// legal max drive-hour ceiling (11 hrs/day, property-carrying driver), not
// a roster-scheduled-hours concept — CLG doesn't have a governed
// schedule-of-record, and tying this KPI to one would just import the same
// blocker stalling KPI 1/4/11 (driver-availability roster). A "working
// day" is any calendar day Samsara HOS shows the driver had real
// driving/on-duty activity — a day fully off-duty (a day off) never was
// realistically available capacity, so it doesn't count against them.
//
// Numerator: actual driving hours, summed per day per driver, from
// Samsara's /fleet/hos/logs (historical duty-status segments) — NOT
// /fleet/hos/clocks, which is a live-only snapshot with no history
// (confirmed via samsara-explore-hos's hosLogsByDriver probe, 2026-08-30:
// {hosStatusType, logStartTime, logEndTime} segments per driver).
// Denominator: 11 hours × the driver's count of working days in the window.
//
// Day-bucketing is UTC calendar-day based (same level of rigor as this
// codebase's other date math, e.g. alvys-trips-report), not converted to
// each driver's local timezone — a segment crossing a UTC day boundary is
// split proportionally across both days.
//
// Requires SAMSARA_API secret (needs "Read Hours of Service" scope,
// already granted per SPEC.md's token checklist).

const SAMSARA_BASE = "https://api.samsara.com";
const MAX_DRIVE_HOURS_PER_DAY = 11; // FMCSA property-carrying driving limit
const DRIVER_BATCH_SIZE = 25; // keep driverIds query params a sane length
const MAX_PAGES_PER_BATCH = 20;

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

async function samsaraGet(path: string, params: Record<string, string>) {
  const url = new URL(`${SAMSARA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
}

async function fetchActiveDriverIds(): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet("/fleet/drivers", { limit: "512", ...(after ? { after } : {}) });
    for (const d of json.data ?? []) {
      if (d.driverActivationStatus === "active") ids.push(d.id);
    }
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return ids;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Splits a [start, end) segment's duration across the UTC calendar days it
// spans, adding to dayHours[dateStr] for each day touched.
function addDrivingHoursByDay(dayHours: Map<string, number>, startIso: string, endIso: string) {
  let cursor = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!(end > cursor)) return;
  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const dateStr = cursorDate.toISOString().slice(0, 10);
    const nextMidnight = Date.UTC(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth(), cursorDate.getUTCDate() + 1);
    const segmentEnd = Math.min(end, nextMidnight);
    const hours = (segmentEnd - cursor) / 3600000;
    dayHours.set(dateStr, (dayHours.get(dateStr) ?? 0) + hours);
    cursor = segmentEnd;
  }
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
    const startTime = new Date(startDate + "T00:00:00Z").toISOString();
    const requestedEndTime = new Date(endDate + "T23:59:59Z").getTime();
    // Samsara rejects a future endTime — clamp to now when the range's end
    // date is today (or, defensively, later).
    const endTime = new Date(Math.min(requestedEndTime, Date.now())).toISOString();

    const driverIds = await fetchActiveDriverIds();

    // Per driver: date -> driving hours that day, and the set of dates with
    // any driving/onDuty activity (the "working days" the legal ceiling
    // applies to).
    const drivingHoursByDriverDate = new Map<string, Map<string, number>>();
    const workingDaysByDriver = new Map<string, Set<string>>();

    for (const batch of chunk(driverIds, DRIVER_BATCH_SIZE)) {
      let after: string | undefined;
      let page = 0;
      while (page < MAX_PAGES_PER_BATCH) {
        const json = await samsaraGet("/fleet/hos/logs", {
          driverIds: batch.join(","), startTime, endTime, ...(after ? { after } : {}),
        });
        for (const entry of json.data ?? []) {
          const driverId = entry.driver?.id;
          if (!driverId) continue;
          const dayHours = drivingHoursByDriverDate.get(driverId) ?? new Map<string, number>();
          const workingDays = workingDaysByDriver.get(driverId) ?? new Set<string>();
          for (const log of entry.hosLogs ?? []) {
            if (log.hosStatusType === "driving" || log.hosStatusType === "onDuty") {
              const dateStr = (log.logStartTime ?? "").slice(0, 10);
              if (dateStr) workingDays.add(dateStr);
            }
            if (log.hosStatusType === "driving" && log.logStartTime && log.logEndTime) {
              addDrivingHoursByDay(dayHours, log.logStartTime, log.logEndTime);
            }
          }
          drivingHoursByDriverDate.set(driverId, dayHours);
          workingDaysByDriver.set(driverId, workingDays);
        }
        if (!json.pagination?.hasNextPage) break;
        after = json.pagination.endCursor;
        page += 1;
      }
    }

    let totalDrivingHours = 0;
    let totalWorkingDays = 0;
    let driversWithActivity = 0;
    for (const driverId of driverIds) {
      const dayHours = drivingHoursByDriverDate.get(driverId);
      const workingDays = workingDaysByDriver.get(driverId);
      if (!workingDays || workingDays.size === 0) continue;
      driversWithActivity += 1;
      totalWorkingDays += workingDays.size;
      for (const hours of (dayHours?.values() ?? [])) totalDrivingHours += hours;
    }

    const availableHours = totalWorkingDays * MAX_DRIVE_HOURS_PER_DAY;

    return new Response(JSON.stringify({
      totalDrivingHours: Math.round(totalDrivingHours * 10) / 10,
      totalWorkingDays,
      legalMaxHoursPerDay: MAX_DRIVE_HOURS_PER_DAY,
      availableHours,
      utilizationPct: availableHours > 0 ? Math.round((totalDrivingHours / availableHours) * 1000) / 10 : null,
      driversConsidered: driverIds.length,
      driversWithActivity,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
