export const CADENCE_OPTIONS = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every other week" },
  { value: "monthly_nth", label: "Specific week of the month" },
];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTH_OCCURRENCE_OPTIONS = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: -1, label: "Last" },
];

function toDate(dateStr) {
  return new Date(dateStr + "T00:00:00Z");
}
function toStr(date) {
  return date.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toStr(d);
}

// 1-based: the 1st/2nd/3rd/... time this weekday has occurred in its month.
function nthWeekdayOccurrenceInMonth(date) {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}
function isLastOccurrenceOfWeekdayInMonth(date) {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + 7);
  return next.getUTCMonth() !== date.getUTCMonth();
}

export function isHomeOn(schedule, dateStr) {
  if (dateStr < schedule.effective_start_date) return false;
  if (schedule.effective_end_date && dateStr > schedule.effective_end_date) return false;

  const date = toDate(dateStr);
  const dow = date.getUTCDay();
  if (!schedule.days_of_week.includes(dow)) return false;

  if (schedule.cadence === "weekly") return true;

  if (schedule.cadence === "biweekly") {
    if (!schedule.anchor_date) return false;
    const daysDiff = Math.round((date - toDate(schedule.anchor_date)) / 86400000);
    const weeksDiff = Math.floor(daysDiff / 7);
    return ((weeksDiff % 2) + 2) % 2 === 0;
  }

  if (schedule.cadence === "monthly_nth") {
    if (schedule.month_occurrence === -1) return isLastOccurrenceOfWeekdayInMonth(date);
    return nthWeekdayOccurrenceInMonth(date) === schedule.month_occurrence;
  }

  return false;
}

// Next `count` dates this schedule applies, starting from `fromDateStr`
// (inclusive), scanning up to `maxDays` ahead so an inactive/expired
// schedule doesn't loop forever.
export function nextOccurrences(schedule, fromDateStr, count = 5, maxDays = 400) {
  const dates = [];
  let cursor = fromDateStr;
  for (let i = 0; i < maxDays && dates.length < count; i++) {
    if (schedule.effective_end_date && cursor > schedule.effective_end_date) break;
    if (isHomeOn(schedule, cursor)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function describeCadence(schedule) {
  // Sort Mon..Sat, Sun-last so a weekend reads "Sat/Sun" not "Sun/Sat".
  const sortKey = (d) => (d === 0 ? 7 : d);
  const days = (schedule.days_of_week || []).slice().sort((a, b) => sortKey(a) - sortKey(b)).map((d) => DAY_LABELS[d]).join("/");
  if (schedule.cadence === "weekly") return `Every ${days}`;
  if (schedule.cadence === "biweekly") return `Every other ${days}`;
  if (schedule.cadence === "monthly_nth") {
    const label = MONTH_OCCURRENCE_OPTIONS.find((o) => o.value === schedule.month_occurrence)?.label ?? "?";
    return `${label} ${days} of the month`;
  }
  return "—";
}
