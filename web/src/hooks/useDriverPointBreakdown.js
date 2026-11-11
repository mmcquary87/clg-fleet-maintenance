import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAccountabilityInfractions } from "./useAccountabilityInfractions";
import { buildScoringIndex, speedingSeverityFromSpeeds } from "../lib/accountabilityScoring";

// Mirrors driver_safety_scorecard_view.sql's weighting exactly, but built
// from accountability_infractions (via buildScoringIndex) instead of a
// second hand-written copy of the weight tables -- see
// 20261029000000_accountability_single_source_of_truth.sql. Per-category
// instead of pre-summed, so a given driver's score can be drilled into
// instead of taken on faith.
const WINDOW_DAYS = 90;

function bucketize(items, nameOf, matcher) {
  const rows = new Map();
  let otherCount = 0;
  for (const item of items) {
    const hit = matcher(nameOf(item));
    if (hit) {
      const row = rows.get(hit.label) ?? { label: hit.label, weight: hit.weight, count: 0, points: 0 };
      row.count += 1;
      row.points += hit.weight;
      rows.set(hit.label, row);
    } else {
      otherCount += 1;
    }
  }
  return { rows: [...rows.values()], otherCount };
}

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null. null (default)
// matches the official trailing-90-day scorecard; any other range mirrors
// whatever window the Rankings tab's date-range tool has selected, so a
// driver's breakdown always lines up with the score it's explaining.
export function useDriverPointBreakdown(driverId, range = null) {
  const { infractions, loading: infractionsLoading } = useAccountabilityInfractions();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!driverId || infractionsLoading) return;
    setLoading(true);
    setError(null);
    const windowStart = range?.start
      ? `${range.start}T00:00:00`
      : new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const windowEnd = range?.end ? `${range.end}T23:59:59.999` : new Date().toISOString();

    const index = buildScoringIndex(infractions);
    const infractionById = new Map(infractions.map((i) => [i.id, i]));

    const [speedingRes, safetyRes, hosRes, manualHosRes, lightRes] = await Promise.all([
      supabase.from("driver_speeding_intervals")
        .select("max_speed_kmh, posted_speed_limit_kmh, start_time")
        .eq("driver_id", driverId).eq("is_dismissed", false)
        .gte("start_time", windowStart).lte("start_time", windowEnd),
      supabase.from("driver_safety_events")
        .select("behavior_labels, coaching_state, event_time")
        .eq("driver_id", driverId).gte("event_time", windowStart).lte("event_time", windowEnd),
      supabase.from("driver_hos_violations")
        .select("description, violation_start_time")
        .eq("driver_id", driverId).gte("violation_start_time", windowStart).lte("violation_start_time", windowEnd),
      // Manually-logged infractions with no Samsara pattern at all (PC
      // Misuse, Yard Move Misuse) that still count toward the score --
      // matched against the already-loaded infractions below rather than a
      // hardcoded family list, same generalization as the SQL's
      // manual_hos_points CTE.
      supabase.from("driver_incidents")
        .select("event_date, infraction_id")
        .eq("driver_id", driverId),
      // Light speeding (1 to <6 mph over the limit) is tallied per driver per
      // UTC day by samsara-sync-driver-safety, not stored per event. Tracked
      // for the compliance record; not part of the score yet.
      supabase.from("driver_light_speeding_daily")
        .select("event_count, total_seconds, day")
        .eq("driver_id", driverId)
        .gte("day", windowStart.slice(0, 10)).lte("day", windowEnd.slice(0, 10)),
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
    const bucketedSeverity = bucketize(eligible, (r) => speedingSeverityFromSpeeds(r.max_speed_kmh, r.posted_speed_limit_kmh), index.matchSpeedingSeverity).rows;
    // Always list all four tiers (light/moderate/heavy/severe), with a 0
    // count where there are no events, so a tier with no data reads as 0
    // instead of silently missing. The Light row stays 0 on purpose: events
    // under 6 mph over are no longer stored per event; they are tallied per
    // day in driver_light_speeding_daily and shown in the footnote as
    // "tracked, not yet scored" (scoring rule for light is pending).
    const bySeverity = ["light", "moderate", "heavy", "severe"].flatMap((tier) => {
      const hit = index.matchSpeedingSeverity(tier);
      if (!hit) return [];
      return [bucketedSeverity.find((r) => r.label === hit.label) ?? { label: hit.label, weight: hit.weight, count: 0, points: 0 }];
    });

    // Safety: dismissed events are excluded entirely before labels are summed.
    const allSafetyEvents = safetyRes.data ?? [];
    // Samsara returns coaching_state lowercase ("dismissed"); compare
    // case-insensitively, same as the SQL scorecard.
    const countedSafetyEvents = allSafetyEvents.filter((e) => (e.coaching_state ?? "").toLowerCase() !== "dismissed");
    const safetyLabels = countedSafetyEvents.flatMap((e) => (Array.isArray(e.behavior_labels) ? e.behavior_labels : []));
    const safety = bucketize(safetyLabels, (l) => l?.name, index.matchSafetyLabel);

    // HOS (Samsara-sourced). Admin/paperwork descriptions (Missing Driver
    // Certification/Shipping ID/Trailer Name) never match -- their
    // infraction rows have counts_toward_score = false, so buildScoringIndex
    // skips them entirely -- they land in otherCount, same as before.
    const hosRowsRaw = hosRes.data ?? [];
    const hos = bucketize(hosRowsRaw, (v) => v.description, index.matchHosDescription);

    // Manually-logged PC Misuse / Yard Move, filtered to the same window as
    // everything else above: a caller-given range filters by event_date
    // directly; the default (no range) load uses each infraction's own
    // rollover_days instead, matching driver_safety_scorecard's point-decay
    // window rather than the 90-day telemetry window used elsewhere here.
    const todayMs = Date.now();
    const manualRows = (manualHosRes.data ?? []).filter((r) => {
      const inf = infractionById.get(r.infraction_id);
      if (!inf || !inf.counts_toward_score) return false;
      if ((inf.accountability_infraction_patterns ?? []).length > 0) return false; // Samsara-matched, handled above
      const eventMs = new Date(`${r.event_date}T00:00:00`).getTime();
      if (range?.start || range?.end) {
        return eventMs >= new Date(windowStart).getTime() && eventMs <= new Date(windowEnd).getTime();
      }
      const rolloverMs = (inf.rollover_days ?? 60) * 24 * 3600 * 1000;
      return eventMs >= todayMs - rolloverMs;
    });
    const manualHosByName = new Map();
    for (const r of manualRows) {
      const inf = infractionById.get(r.infraction_id);
      const row = manualHosByName.get(inf.name) ?? { label: inf.name, weight: inf.points, count: 0, points: 0 };
      row.count += 1;
      row.points += inf.points;
      manualHosByName.set(inf.name, row);
    }
    const hosRowsCombined = [...hos.rows, ...manualHosByName.values()];

    setData({
      windowStart,
      speeding: {
        // null (not zero) if the tally couldn't be read, so the screen says
        // nothing instead of claiming "0 light events".
        light: lightRes.error ? null : {
          events: (lightRes.data ?? []).reduce((s, r) => s + (r.event_count ?? 0), 0),
          minutes: Math.round((lightRes.data ?? []).reduce((s, r) => s + Number(r.total_seconds ?? 0), 0) / 60),
          days: (lightRes.data ?? []).length,
        },
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
  }, [driverId, range?.start, range?.end, infractions, infractionsLoading]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
