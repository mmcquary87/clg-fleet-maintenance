export const ANNUAL_INSPECTION_INTERVAL_DAYS = 365;
export const DUE_SOON_WINDOW_DAYS = 14;

export const MILESTONES = [
  { key: "pm", label: "PM / Oil", lastField: "last_pm_date", intervalField: "pm_interval_days", fixedInterval: null },
  { key: "annual", label: "Annual Inspection", lastField: "last_annual_inspection_date", intervalField: null, fixedInterval: ANNUAL_INSPECTION_INTERVAL_DAYS },
  { key: "midtrip", label: "Midtrip Inspection", lastField: "last_midtrip_date", intervalField: "midtrip_interval_days", fixedInterval: null },
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

// Worst status across all milestones for a unit — drives the roster's at-a-glance badge.
export function worstStatus(unit) {
  const statuses = MILESTONES.map((m) => {
    const interval = m.fixedInterval ?? unit[m.intervalField];
    return dueStatus(nextDueDate(unit[m.lastField], interval));
  });
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("due_soon")) return "due_soon";
  if (statuses.every((s) => s === "unknown")) return "unknown";
  return "ok";
}
