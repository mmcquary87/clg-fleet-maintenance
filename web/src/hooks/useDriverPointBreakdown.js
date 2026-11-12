import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAccountabilityInfractions } from "./useAccountabilityInfractions";
import { buildScoringIndex } from "../lib/accountabilityScoring";
import { buildSpeedingEpisodes, episodePoints, lightSpeedingBucket, parseScoringParameters } from "../lib/speedingEpisodes";

// Mirrors driver_safety_scorecard_view.sql's weighting exactly, but built
// from accountability_infractions (via buildScoringIndex) instead of a
// second hand-written copy of the weight tables -- see
// 20261029000000_accountability_single_source_of_truth.sql. Per-category
// instead of pre-summed, so a given driver's score can be drilled into
// instead of taken on faith. Speeding is scored per episode; light speeding is
// bucketed (1/2/3 points off the overall score): see lib/speedingEpisodes.js,
// 20261111110000_episode_speeding_and_light_scoring.sql and
// 20261112020000_light_speeding_buckets.sql.
const WINDOW_DAYS = 90;
const KMH_TO_MPH = 0.621371;
const PAGE_SIZE = 1000; // PostgREST returns at most this many rows per request

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

// A heavy driver has well over 1,000 speeding intervals in 90 days, so a
// plain select would silently stop at the first page.
async function fetchAllPages(buildQuery) {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: out, error: null };
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
    // Official view = exactly 90 days; a custom range scales miles and the
    // the light-speeding rate's miles by days / 90 (same as driver_safety_scorecard_range).
    const windowDays = range?.start || range?.end
      ? Math.max((new Date(windowEnd).getTime() - new Date(windowStart).getTime()) / 86400000, 1)
      : WINDOW_DAYS;

    const index = buildScoringIndex(infractions);
    const infractionById = new Map(infractions.map((i) => [i.id, i]));

    const [speedingRes, safetyRes, hosRes, manualHosRes, lightRes, paramsRes, milesRes] = await Promise.all([
      fetchAllPages(() => supabase.from("driver_speeding_intervals")
        .select("id, max_speed_kmh, posted_speed_limit_kmh, start_time, end_time")
        .eq("driver_id", driverId).eq("is_dismissed", false)
        .gte("start_time", windowStart).lte("start_time", windowEnd)
        .order("start_time", { ascending: true }).order("id", { ascending: true })),
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
      // UTC day by samsara-sync-driver-safety, not stored per event.
      supabase.from("driver_light_speeding_daily")
        .select("event_count, total_seconds, day")
        .eq("driver_id", driverId)
        .gte("day", windowStart.slice(0, 10)).lte("day", windowEnd.slice(0, 10)),
      supabase.from("scoring_parameters").select("name, value"),
      // 90-day miles snapshot, the denominator for the light-speeding rate.
      supabase.from("driver_fuel_energy").select("distance_traveled_meters").eq("driver_id", driverId).maybeSingle(),
    ]);

    const params = parseScoringParameters(paramsRes.data);
    const err = speedingRes.error || safetyRes.error || hosRes.error || manualHosRes.error || paramsRes.error || milesRes.error
      || (!params ? { message: "Scoring parameters are not available." } : null);
    if (err) {
      setError(err.message);
      setData(null);
      setLoading(false);
      return;
    }

    // Speeding: intervals at 6+ mph over (and <= 85 mph) are merged into
    // episodes; each scores its highest tier x a duration weight.
    const speedingRows = speedingRes.data ?? [];
    const excludedOver85 = speedingRows.filter((r) => (r.max_speed_kmh ?? 0) * KMH_TO_MPH > 85).length;
    const tierWeight = (tier) => index.matchSpeedingSeverity(tier)?.weight ?? 0;
    const episodes = buildSpeedingEpisodes(speedingRows, { gapMinutes: params.gapMinutes, tierWeight });
    const tierRows = ["moderate", "heavy", "severe"].map((tier) => {
      const mine = episodes.filter((e) => e.tier === tier);
      const points = mine.reduce((s, e) => s + episodePoints(e, params), 0);
      const hit = index.matchSpeedingSeverity(tier);
      return {
        label: `${hit?.label ?? `${tier[0].toUpperCase()}${tier.slice(1)} speeding`} (episodes)`,
        count: mine.length,
        // average effective weight: the tier weight x the average duration weight
        weight: mine.length ? Math.round((points / mine.length) * 100) / 100 : (hit?.weight ?? 0),
        points,
      };
    });

    const lightDays = lightRes.data ?? [];
    const lightMinutes = lightDays.reduce((s, r) => s + Number(r.total_seconds ?? 0), 0) / 60;
    const lightEvents = lightDays.reduce((s, r) => s + (r.event_count ?? 0), 0);
    const miles = Number(milesRes.data?.distance_traveled_meters ?? 0) * 0.000621371;
    const lightBucket = lightSpeedingBucket({ events: lightEvents, miles, windowDays }, params);
    // Light speeding is bucketed (events per 1,000 miles) and takes points off
    // the OVERALL score, not the speeding component.
    const light = lightRes.error ? null : {
      events: lightEvents,
      minutes: Math.round(lightMinutes),
      days: lightDays.length,
      ratePer1k: lightBucket.ratePer1k,
      bucket: lightBucket.bucket,
      points: lightBucket.points,
      scored: lightBucket.scored,
    };

    // Safety: dismissed events are excluded entirely before labels are summed.
    const allSafetyEvents = safetyRes.data ?? [];
    // Samsara returns coaching_state lowercase ("dismissed"); compare
    // case-insensitively, same as the SQL scorecard.
    const countedSafetyEvents = allSafetyEvents.filter((e) => (e.coaching_state ?? "").toLowerCase() !== "dismissed");
    const safetyLabels = countedSafetyEvents.flatMap((e) => (Array.isArray(e.behavior_labels) ? e.behavior_labels : []));
    const safety = bucketize(safetyLabels, (l) => l?.name, index.matchSafetyLabel);

    // HOS (Samsara-sourced), including the paperwork items that carry points
    // (missing driver certification, trailer name, shipping ID). Anything
    // with no scoring rule at all lands in otherCount.
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
        rows: tierRows,
        episodes: episodes.length,
        intervals: speedingRows.length - excludedOver85,
        params,
        penaltyPoints: tierRows.reduce((s, r) => s + r.points, 0),
        excludedOver85,
      },
      light,
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
