// Fleet Maintenance System — check-call board pure helpers.
//
// The coverage grid and KPI tiles are both just aggregations over today's
// check_calls rows against the current hour -- kept here, not inline in
// the component, so "what counts as covered/missed/not due" has one home.

// CLG's flat reference table for a rough drive-time-from-miles read
// without opening a routing tool. Optimistic past ~8h (ignores the
// 30-minute break / 14-hour on-duty limit) -- same caveat the source
// design called out, not a compliance number like useTracking's HOS math.
export const MILES_TO_DRIVE_TIME_MPH = 60;
export const MILES_TO_DRIVE_TIME = [30, 60, 120, 300, 600].map((miles) => ({ miles, hours: miles / MILES_TO_DRIVE_TIME_MPH }));

export function fmtHoursAsClock(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// "PP", "JL" -- initials from a full name, for the compact BY column and
// call-thread entries (CLG's dispatchers already sign notes this way in
// the workbook this replaces).
export function initialsFor(fullName) {
  if (!fullName) return "—";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hourStart(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

// Midnight through 11pm today -- a fixed 24-cell row regardless of how
// far the day has gotten, so "not due yet" reads the same shape every hour.
export function hoursOfDay(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 24 }, (_, i) => new Date(start.getTime() + i * 3600000));
}

// Per-driver coverage for today: called / missed / off-duty / not-due for
// each hour, plus derived summary fields. `calls` is one driver/unit's
// check_calls rows for today, oldest first.
export function coverageFor(calls, now = new Date()) {
  const byHour = new Map(calls.map((c) => [hourStart(c.call_hour).getTime(), c]));
  const offDutyCall = [...calls].reverse().find((c) => c.off_duty);
  const offDutyFromMs = offDutyCall ? hourStart(offDutyCall.call_hour).getTime() : null;
  const currentHourMs = hourStart(now).getTime();

  const cells = hoursOfDay(now).map((hour) => {
    const call = byHour.get(hour.getTime());
    if (call) return { hour, state: "called", call };
    if (hour.getTime() > currentHourMs) return { hour, state: "not_due", call: null };
    if (offDutyFromMs != null && hour.getTime() >= offDutyFromMs) return { hour, state: "off_duty", call: null };
    return { hour, state: "missed", call: null };
  });

  const lastCall = calls.length > 0 ? calls[calls.length - 1] : null;
  const missedCount = cells.filter((c) => c.state === "missed").length;
  const dueSoFar = cells.filter((c) => c.state !== "not_due").length;

  return {
    cells,
    lastCall,
    missedCount,
    fullyCovered: missedCount === 0 && dueSoFar > 0,
    neverCalledToday: calls.length === 0,
  };
}

// Most recent free-time/detention deadline this driver has on file today
// (a later call can supersede or clear an earlier one).
export function latestFreeTimeExpiry(calls) {
  const withExpiry = [...calls].reverse().find((c) => c.free_time_expires_at);
  return withExpiry ? new Date(withExpiry.free_time_expires_at) : null;
}

// Board-wide summary for the KPI tiles.
export function boardSummary(boards, now = new Date()) {
  const total = boards.length;
  const fullyCovered = boards.filter((b) => b.coverage.fullyCovered).length;
  const neverCalled = boards.filter((b) => b.coverage.neverCalledToday);
  const totalMissedHours = boards.reduce((sum, b) => sum + b.coverage.missedCount, 0);
  const detentionSoon = boards
    .map((b) => ({ board: b, expiresAt: latestFreeTimeExpiry(b.calls) }))
    .filter((x) => x.expiresAt && x.expiresAt.getTime() > now.getTime() && x.expiresAt.getTime() - now.getTime() <= 3600000)
    .sort((a, b) => a.expiresAt - b.expiresAt);

  return { total, fullyCovered, neverCalled, totalMissedHours, detentionSoon };
}

// Picks the single most overdue driver for the "Call now" card -- longest
// stretch since their last call (or never called at all today).
export function mostOverdue(boards, now = new Date()) {
  let worst = null;
  let worstGapMs = -1;
  for (const b of boards) {
    const since = b.coverage.lastCall ? new Date(b.coverage.lastCall.logged_at) : null;
    const gapMs = since ? now.getTime() - since.getTime() : Infinity;
    if (b.coverage.missedCount > 0 && gapMs > worstGapMs) {
      worst = b;
      worstGapMs = gapMs;
    }
  }
  return worst ? { board: worst, gapMs: worstGapMs } : null;
}
