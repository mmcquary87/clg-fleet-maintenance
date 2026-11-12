// Client-side mirror of driver_safety_scorecard's speeding scoring
// (20261111110000_episode_speeding_and_light_scoring.sql). Pure functions, no
// Supabase calls, so the breakdown screen can show exactly how a driver's
// speeding penalty was built.
//
// 1. Intervals at >= 6 mph over the posted limit (and <= 85 mph, not
//    dismissed) are merged into EPISODES: consecutive intervals for one driver
//    whose gap from the latest end time seen so far is <= gapMinutes.
// 2. An episode scores the weight of the highest tier it reached, multiplied by
//    1 + min(durMaxExtra, minutesOverLimit / durStepMinutes).
// 3. Light speeding (1 to <6 mph over, tallied per day) adds a rate-based
//    penalty with a free allowance and a ceiling.
// All numbers come from scoring_parameters (see lightSpeedingPenalty).

const KMH_TO_MPH = 0.621371;
const TIER_RANK = { moderate: 1, heavy: 2, severe: 3 };

function tierOfMph(mph) {
  if (mph >= 15) return "severe";
  if (mph >= 10) return "heavy";
  return "moderate"; // >= 6 only; callers filter below that out
}

// intervals: rows with { id, start_time, end_time, max_speed_kmh, posted_speed_limit_kmh }
// (already limited to one driver, not dismissed, inside the window).
// tierWeight: (tier) => weight points for that tier (0 if it doesn't score).
// Returns episodes: { tier, weight, overMinutes, intervalCount }.
export function buildSpeedingEpisodes(intervals, { gapMinutes, tierWeight }) {
  const events = [];
  for (const r of intervals) {
    if (r.max_speed_kmh == null || r.posted_speed_limit_kmh == null) continue;
    if (r.max_speed_kmh * KMH_TO_MPH > 85) continue;
    const mph = (r.max_speed_kmh - r.posted_speed_limit_kmh) * KMH_TO_MPH;
    if (mph < 6) continue;
    const startMs = new Date(r.start_time).getTime();
    const endMs = r.end_time ? new Date(r.end_time).getTime() : startMs;
    events.push({
      id: String(r.id),
      startMs,
      endMs,
      durSec: Math.max(0, (endMs - startMs) / 1000),
      tier: tierOfMph(mph),
    });
  }
  events.sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const gapMs = gapMinutes * 60 * 1000;
  const episodes = [];
  let current = null;
  let maxEndMs = null; // latest end among all earlier intervals (matches the SQL window)
  for (const e of events) {
    const startsNew = maxEndMs === null || e.startMs - maxEndMs > gapMs;
    if (startsNew) {
      current = { tier: e.tier, weight: tierWeight(e.tier), overSeconds: 0, intervalCount: 0 };
      episodes.push(current);
    }
    const w = tierWeight(e.tier);
    if (w > current.weight || (w === current.weight && TIER_RANK[e.tier] > TIER_RANK[current.tier])) {
      current.weight = w;
      current.tier = e.tier;
    }
    current.overSeconds += e.durSec;
    current.intervalCount += 1;
    maxEndMs = maxEndMs === null ? e.endMs : Math.max(maxEndMs, e.endMs);
  }
  return episodes.map((ep) => ({
    tier: ep.tier,
    weight: ep.weight,
    overMinutes: ep.overSeconds / 60,
    intervalCount: ep.intervalCount,
  }));
}

export function episodePoints(episode, { durStepMinutes, durMaxExtra }) {
  return episode.weight * (1 + Math.min(durMaxExtra, episode.overMinutes / durStepMinutes));
}

// minutes: light-speeding minutes in the window; miles: the driver's 90-day
// snapshot miles; windowDays: 90 for the official view, the range length for a
// custom range (miles and the penalty scale with days / 90, as in the SQL).
export function lightSpeedingPenalty({ minutes, miles, windowDays }, p) {
  if (!(miles >= p.lightMinMiles)) return { points: 0, ratePer1k: null, scored: false };
  const days = Math.max(windowDays, 1);
  const ratePer1k = minutes / ((miles * days / 90) / 1000);
  const points = p.lightCap * (1 - Math.exp(-Math.max(0, ratePer1k - p.lightAllowance) / p.lightK)) * days / 90;
  return { points, ratePer1k, scored: true };
}

// scoring_parameters rows ([{name, value}]) -> the named numbers above.
export function parseScoringParameters(rows) {
  const m = new Map((rows ?? []).map((r) => [r.name, Number(r.value)]));
  const get = (name) => (m.has(name) ? m.get(name) : null);
  const p = {
    gapMinutes: get("speeding_episode_gap_minutes"),
    durStepMinutes: get("speeding_episode_duration_step_minutes"),
    durMaxExtra: get("speeding_episode_duration_max_extra"),
    lightMinMiles: get("light_min_miles"),
    lightAllowance: get("light_allowance_min_per_1k_miles"),
    lightCap: get("light_cap_points"),
    lightK: get("light_k_min_per_1k_miles"),
  };
  return Object.values(p).some((v) => v === null || Number.isNaN(v)) ? null : p;
}
