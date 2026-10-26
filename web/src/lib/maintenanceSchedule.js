// 364, not 365 -- an annual inspection done 9/10 is valid through 9/9 of
// the following year (expires the day before the anniversary), not
// through the anniversary date itself.
export const ANNUAL_INSPECTION_INTERVAL_DAYS = 364;
export const DUE_SOON_WINDOW_DAYS = 14;

// Midtrip interval is per-unit (varies by truck make/model), not fixed like
// Annual's -- but a unit that's never had one set shouldn't need a manual
// "type 90 and save" just to get a Next Due date out of its first mid-trip.
export const MIDTRIP_DEFAULT_INTERVAL_DAYS = 90;

// Mileage-tracked milestones are due by odometer reading, not a fixed day
// count (intervals vary by make/component) -- see 20261012020000_pm_odometer_tracking.sql
// and 20261026010000_additional_pm_intervals.sql. Matches the "due soon"
// cutoff alvysPmNote() already used for its own read-only Alvys-sourced
// odometer note.
export const PM_DUE_SOON_WINDOW_MILES = 2500;

// Each milestone tracks a date schedule, a mileage schedule, or both --
// `mileage` (lastField/intervalField for odometer tracking) is omitted
// entirely for a pure date milestone (Annual, Midtrip, Cabin Air Filter).
// `lastField`/`intervalField` are both null for a pure mileage milestone
// with no date fallback at all (Transmission Fluid, Differential Oil).
// mileageRule (only meaningful when `mileage` is set):
//   "only"            -- mileage is the only schedule; there's no date side.
//   "prefer"           -- mileage wins whenever the unit has enough odometer
//                         data on file (last-done odometer + interval + a
//                         current reading); date is only a fallback for a
//                         unit with none (e.g. a trailer, or before its
//                         first odometer-tracked service here).
//   "whichever_first"  -- both schedules are tracked at once and the
//                         milestone is due at whichever comes first (e.g.
//                         Fuel Filter: "every 6 months or 50,000 mi").
export const MILESTONES = [
  { key: "pm", label: "PM / Oil", lastField: "last_pm_date", intervalField: "pm_interval_days", fixedInterval: null,
    mileage: { lastField: "last_pm_odometer", intervalField: "pm_interval_miles" }, mileageRule: "prefer" },
  { key: "annual", label: "Annual Inspection", lastField: "last_annual_inspection_date", intervalField: null, fixedInterval: ANNUAL_INSPECTION_INTERVAL_DAYS },
  { key: "midtrip", label: "Midtrip Inspection", lastField: "last_midtrip_date", intervalField: "midtrip_interval_days", fixedInterval: null },
  { key: "transmission_fluid", label: "Transmission Fluid", lastField: null, intervalField: null, fixedInterval: null,
    mileage: { lastField: "last_transmission_fluid_odometer", intervalField: "transmission_fluid_interval_miles" }, mileageRule: "only" },
  { key: "engine_air_filter", label: "Engine Air Filter", lastField: "last_engine_air_filter_date", intervalField: "engine_air_filter_interval_days", fixedInterval: null,
    mileage: { lastField: "last_engine_air_filter_odometer", intervalField: "engine_air_filter_interval_miles" }, mileageRule: "prefer" },
  { key: "cabin_air_filter", label: "Cabin Air Filter", lastField: "last_cabin_air_filter_date", intervalField: "cabin_air_filter_interval_days", fixedInterval: null },
  { key: "differential_oil", label: "Differential Oil Change", lastField: null, intervalField: null, fixedInterval: null,
    mileage: { lastField: "last_differential_oil_odometer", intervalField: "differential_oil_interval_miles" }, mileageRule: "only" },
  { key: "fuel_filter", label: "Fuel Filter", lastField: "last_fuel_filter_date", intervalField: "fuel_filter_interval_days", fixedInterval: null,
    mileage: { lastField: "last_fuel_filter_odometer", intervalField: "fuel_filter_interval_miles" }, mileageRule: "whichever_first" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function nextDueDate(lastDateStr, intervalDays) {
  if (!lastDateStr || !intervalDays) return null;
  const d = new Date(lastDateStr + "T00:00:00");
  d.setDate(d.getDate() + Number(intervalDays));
  return d.toISOString().slice(0, 10);
}

// "unknown" — no last date or no interval set yet, can't compute
// "overdue" | "due_soon" (within DUE_SOON_WINDOW_DAYS) | "ok"
export function dueStatus(nextDueStr) {
  if (!nextDueStr) return "unknown";
  const today = todayStr();
  const daysUntil = (new Date(nextDueStr + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000;
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= DUE_SOON_WINDOW_DAYS) return "due_soon";
  return "ok";
}

// Pure: given the unit's CURRENT midtrip_interval_days (already fetched by
// the caller) and the unit fields about to be written, defaults the interval
// to 90 only when a mid-trip date is being set AND the unit has never had an
// interval (nothing explicit in `fields` either) -- never overwrites a value
// the user already set or is explicitly saving.
export function withMidtripIntervalDefault(currentIntervalDays, fields) {
  if (fields.last_midtrip_date == null) return fields;
  if (currentIntervalDays != null) return fields;
  if (fields.midtrip_interval_days != null) return fields;
  return { ...fields, midtrip_interval_days: MIDTRIP_DEFAULT_INTERVAL_DAYS };
}

export function pmNextDueOdometer(lastOdometer, intervalMiles) {
  if (lastOdometer == null || !intervalMiles) return null;
  return Number(lastOdometer) + Number(intervalMiles);
}

// "unknown" — no odometer reading to compare against (no last-service-
// odometer/interval on file, or the unit itself has no current odometer,
// e.g. a trailer) -- the caller falls back to date-based dueStatus() in
// that case.
export function pmOdometerStatus(nextDueOdometer, currentOdometer) {
  if (nextDueOdometer == null || currentOdometer == null) return "unknown";
  const remaining = nextDueOdometer - currentOdometer;
  if (remaining < 0) return "overdue";
  if (remaining <= PM_DUE_SOON_WINDOW_MILES) return "due_soon";
  return "ok";
}

const STATUS_RANK = { unknown: -1, ok: 0, due_soon: 1, overdue: 2 };

// Resolves one milestone's live due status/next-due value for a unit --
// the single place that knows how to combine a milestone's date and
// mileage schedules (see MILESTONES' mileageRule doc above), shared by
// worstStatus() (roster badge) and MilestoneRow (unit detail page) so they
// can never disagree. dueOverride (a real external answer, e.g. Alvys'
// own DOT/Midtrip due date) wins over the computed date when supplied.
export function resolveMilestone(m, unit, dueOverride) {
  const dateInterval = m.fixedInterval ?? (m.intervalField ? unit[m.intervalField] : null);
  const nextDate = m.lastField ? (dueOverride ?? nextDueDate(unit[m.lastField], dateInterval)) : null;
  const dateStatus = m.lastField ? dueStatus(nextDate) : "unknown";

  if (!m.mileage) {
    return { status: dateStatus, usingMileage: false, nextDate, nextOdometer: null, milesRemaining: null };
  }

  const nextOdometer = pmNextDueOdometer(unit[m.mileage.lastField], unit[m.mileage.intervalField]);
  const mileageStatus = pmOdometerStatus(nextOdometer, unit.odometer);

  const usingMileage = m.mileageRule === "only" ? true
    : m.mileageRule === "prefer" ? mileageStatus !== "unknown"
    : mileageStatus !== "unknown" && (dateStatus === "unknown" || STATUS_RANK[mileageStatus] >= STATUS_RANK[dateStatus]);

  const status = usingMileage ? mileageStatus : dateStatus;
  const milesRemaining = usingMileage && unit.odometer != null && nextOdometer != null ? nextOdometer - unit.odometer : null;

  return { status, usingMileage, nextDate, nextOdometer, milesRemaining };
}

// Worst status across all milestones for a unit — drives the roster's at-a-glance badge.
export function worstStatus(unit) {
  const statuses = MILESTONES.map((m) => resolveMilestone(m, unit).status);
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("due_soon")) return "due_soon";
  if (statuses.every((s) => s === "unknown")) return "unknown";
  return "ok";
}
