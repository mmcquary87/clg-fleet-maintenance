import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Mirrors driver_safety_scorecard_view.sql's weighting exactly (see that
// migration's header comment for the "Magic Math" source), but per-category
// instead of pre-summed, so a given driver's score can be drilled into
// instead of taken on faith. Computed client-side against the same raw
// tables the view reads (all select-all-authenticated under RLS) rather
// than via a second SQL view, so there's one formula to keep in sync, not
// two.
const WINDOW_DAYS = 90;

function startsWithCI(str, prefix) {
  return (str || "").toLowerCase().startsWith(prefix.toLowerCase());
}

const SPEEDING_WEIGHTS = { moderate: 0.25, heavy: 0.75, severe: 1.75 };

// Yard move / personal-conveyance misuse removed from here -- neither is a
// Samsara behavior label (both are manually-logged driver_incidents, folded
// into the HOS bucket below instead) -- see 20261028030000.
const SAFETY_CATEGORIES = [
  { label: "Harsh brake / braking", weight: 0.75, match: (n) => startsWithCI(n, "harsh brake") || startsWithCI(n, "braking") },
  { label: "Rolling stop", weight: 0.75, match: (n) => startsWithCI(n, "rolling stop") },
  { label: "Following distance", weight: 1.5, match: (n) => startsWithCI(n, "following distance") },
  { label: "Forward collision warning", weight: 1.75, match: (n) => startsWithCI(n, "forward collision") },
  { label: "Harsh turn", weight: 1.0, match: (n) => startsWithCI(n, "harsh turn") },
  { label: "Crash", weight: 2.0, match: (n) => startsWithCI(n, "crash") },
  { label: "Roadside parking", weight: 0.75, match: (n) => startsWithCI(n, "roadside parking") },
  { label: "Ran red light", weight: 2.0, match: (n) => startsWithCI(n, "ran red light") || startsWithCI(n, "red light") },
];

// Missing Driver Certification / Missing Shipping ID / Missing Trailer
// Name are intentionally excluded from scoring (see
// 20261014030000_hos_score_exclude_admin_violations.sql) -- a 2026-10-14
// spot check found this admin/paperwork family saturating HOS to 0 for
// the fleet's best driver, worst driver, and a brand-new hire alike, so
// it doesn't discriminate between good and bad driving. They still show
// up in the panel's "unweighted" count for visibility, just not here.
const HOS_CATEGORIES = [
  { label: "Missed rest break", weight: 0.75, match: (d) => startsWithCI(d, "missed rest break") },
  { label: "Shift driving limit (11-hr)", weight: 2.75, match: (d) => startsWithCI(d, "shift driving limit") },
  { label: "Cycle limit", weight: 2.75, match: (d) => startsWithCI(d, "cycle limit") },
  { label: "Shift duty limit", weight: 2.75, match: (d) => startsWithCI(d, "shift duty limit") },
];

// Yard Move / PC Misuse have no Samsara violation type -- Safety logs them
// manually (Log Incident -> driver_incidents), and 20261028030000 folds
// them into the live Driver Score's HOS bucket from there. Mirrored here
// the same way.
const MANUAL_HOS_FAMILIES = ["Yard Move", "Personal Conveyance"];

function bucketize(categories, items, nameOf) {
  const counts = categories.map((c) => ({ label: c.label, weight: c.weight, count: 0, points: 0 }));
  let otherCount = 0;
  for (const item of items) {
    const name = nameOf(item);
    const cat = categories.find((c) => c.match(name));
    if (cat) {
      const row = counts.find((r) => r.label === cat.label);
      row.count += 1;
      row.points += cat.weight;
    } else {
      otherCount += 1;
    }
  }
  return { rows: counts.filter((r) => r.count > 0), otherCount };
}

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null. null (default)
// matches the official trailing-90-day scorecard; any other range mirrors
// whatever window the Rankings tab's date-range tool has selected, so a
// driver's breakdown always lines up with the score it's explaining.
export function useDriverPointBreakdown(driverId, range = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    setError(null);
    const windowStart = range?.start
      ? `${range.start}T00:00:00`
      : new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const windowEnd = range?.end ? `${range.end}T23:59:59.999` : new Date().toISOString();

    const [speedingRes, safetyRes, hosRes, manualHosRes] = await Promise.all([
      supabase.from("driver_speeding_intervals")
        .select("severity_level, max_speed_kmh, start_time")
        .eq("driver_id", driverId).eq("is_dismissed", false)
        .gte("start_time", windowStart).lte("start_time", windowEnd),
      supabase.from("driver_safety_events")
        .select("behavior_labels, coaching_state, event_time")
        .eq("driver_id", driverId).gte("event_time", windowStart).lte("event_time", windowEnd),
      supabase.from("driver_hos_violations")
        .select("description, violation_start_time")
        .eq("driver_id", driverId).gte("violation_start_time", windowStart).lte("violation_start_time", windowEnd),
      // Manually-logged Yard Move/PC Misuse incidents use the infraction's
      // own rollover_days for a default (trailing-90-day) load, same as the
      // scorecard view; a caller-given range filters by event_date instead,
      // same as driver_safety_scorecard_range -- see 20261028030000.
      supabase.from("driver_incidents")
        .select("event_date, infraction:accountability_infractions(name, violation_family, points, rollover_days)")
        .eq("driver_id", driverId),
    ]);

    const err = speedingRes.error || safetyRes.error || hosRes.error || manualHosRes.error;
    if (err) {
      setError(err.message);
      setData(null);
      setLoading(false);
      return;
    }

    // Speeding: only intervals at/under 85mph score, same filter as the view.
    const speedingRows = speedingRes.data ?? [];
    const eligible = speedingRows.filter((r) => (r.max_speed_kmh ?? 0) * 0.621371 <= 85);
    const bySeverity = ["moderate", "heavy", "severe"]
      .map((level) => {
        const count = eligible.filter((r) => r.severity_level === level).length;
        return { label: level, weight: SPEEDING_WEIGHTS[level], count, points: count * SPEEDING_WEIGHTS[level] };
      })
      .filter((r) => r.count > 0);

    // Safety: dismissed events are excluded entirely before labels are summed.
    const allSafetyEvents = safetyRes.data ?? [];
    const countedSafetyEvents = allSafetyEvents.filter((e) => (e.coaching_state ?? "") !== "Dismissed");
    const safetyLabels = countedSafetyEvents.flatMap((e) => (Array.isArray(e.behavior_labels) ? e.behavior_labels : []));
    const safety = bucketize(SAFETY_CATEGORIES, safetyLabels, (l) => l?.name);

    // HOS
    const hosRowsRaw = hosRes.data ?? [];
    const hos = bucketize(HOS_CATEGORIES, hosRowsRaw, (v) => v.description);

    // Manually-logged Yard Move / PC Misuse, filtered to the same window as
    // everything else above: a caller-given range filters by event_date
    // directly; the default (no range) load uses each infraction's own
    // rollover_days instead, matching driver_safety_scorecard's point-decay
    // window rather than the 90-day telemetry window used elsewhere here.
    const todayMs = Date.now();
    const manualRows = (manualHosRes.data ?? []).filter((r) => {
      if (!r.infraction || !MANUAL_HOS_FAMILIES.includes(r.infraction.violation_family)) return false;
      const eventMs = new Date(`${r.event_date}T00:00:00`).getTime();
      if (range?.start || range?.end) {
        return eventMs >= new Date(windowStart).getTime() && eventMs <= new Date(windowEnd).getTime();
      }
      const rolloverMs = (r.infraction.rollover_days ?? 60) * 24 * 3600 * 1000;
      return eventMs >= todayMs - rolloverMs;
    });
    const manualHosByName = new Map();
    for (const r of manualRows) {
      const name = r.infraction.name;
      const row = manualHosByName.get(name) ?? { label: name, weight: r.infraction.points, count: 0, points: 0 };
      row.count += 1;
      row.points += r.infraction.points;
      manualHosByName.set(name, row);
    }
    const manualHosRows = [...manualHosByName.values()];
    const hosRowsCombined = [...hos.rows, ...manualHosRows];

    setData({
      windowStart,
      speeding: {
        bySeverity,
        penaltyPoints: bySeverity.reduce((s, r) => s + r.points, 0),
        excludedOver85: speedingRows.length - eligible.length,
      },
      safety: {
        rows: safety.rows,
        otherCount: safety.otherCount,
        dismissedCount: allSafetyEvents.length - countedSafetyEvents.length,
        points: safety.rows.reduce((s, r) => s + r.points, 0),
      },
      hos: {
        rows: hosRowsCombined,
        otherCount: hos.otherCount,
        points: hosRowsCombined.reduce((s, r) => s + r.points, 0),
      },
    });
    setLoading(false);
  }, [driverId, range?.start, range?.end]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
