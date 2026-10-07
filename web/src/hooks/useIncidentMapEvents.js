import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const WINDOW_DAYS = 90; // matches driver_safety_scorecard's scoring window

function speedingWeight(severityLevel) {
  return { moderate: 0.25, heavy: 0.75, severe: 1.75 }[severityLevel] ?? 0;
}

// Same behavior-label weight matching as driver_safety_scorecard_view.sql's
// safety_points CTE, reproduced here client-side since this map needs a
// per-event severity tier, not a per-driver sum.
const SAFETY_WEIGHTS = [
  [/harsh brake|braking/i, 0.75],
  [/rolling stop/i, 0.75],
  [/following distance/i, 1.5],
  [/forward collision/i, 1.75],
  [/harsh turn/i, 1.0],
  [/crash/i, 2.0],
  [/roadside parking/i, 0.75],
  [/ran red light|red light/i, 2.0],
  [/yard move/i, 0.75],
  [/personal conveyance|pc misuse/i, 1.0],
];

function safetyEventWeight(behaviorLabels) {
  let max = 0;
  for (const label of behaviorLabels ?? []) {
    const name = label?.name ?? "";
    for (const [re, w] of SAFETY_WEIGHTS) {
      if (re.test(name)) max = Math.max(max, w);
    }
  }
  return max;
}

// Three tiers across both event types, on our own point scale (max 2.0),
// not the old Power BI report's unrelated raw-point scale.
function severityTier(weight) {
  if (weight >= 1.5) return "high";
  if (weight >= 0.75) return "moderate";
  return "minor";
}

export function useIncidentMapEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

    const [speedingRes, safetyRes] = await Promise.all([
      supabase
        .from("driver_speeding_intervals")
        .select("id, start_time, severity_level, latitude, longitude, driver:drivers(name)")
        .gte("start_time", since)
        .not("latitude", "is", null),
      supabase
        .from("driver_safety_events")
        .select("id, event_time, behavior_labels, coaching_state, latitude, longitude, driver:drivers(name)")
        .gte("event_time", since)
        .not("latitude", "is", null),
    ]);

    const err = speedingRes.error || safetyRes.error;
    if (err) {
      setError(err.message);
      setEvents([]);
      setLoading(false);
      return;
    }

    const speedingEvents = (speedingRes.data ?? []).map((r) => {
      const weight = speedingWeight(r.severity_level);
      return {
        id: `speeding:${r.id}`,
        type: "speeding",
        date: r.start_time,
        lat: r.latitude,
        lng: r.longitude,
        driverName: r.driver?.name ?? "Unassigned",
        label: `${r.severity_level} speeding`,
        weight,
        tier: severityTier(weight),
      };
    });

    const safetyEvents = (safetyRes.data ?? [])
      .filter((r) => (r.coaching_state ?? "") !== "Dismissed")
      .map((r) => {
        const weight = safetyEventWeight(r.behavior_labels);
        const labelNames = (r.behavior_labels ?? []).map((l) => l?.name).filter(Boolean).join(", ") || "Safety event";
        return {
          id: `safety:${r.id}`,
          type: "safety",
          date: r.event_time,
          lat: r.latitude,
          lng: r.longitude,
          driverName: r.driver?.name ?? "Unassigned",
          label: labelNames,
          weight,
          tier: severityTier(weight),
        };
      });

    setEvents([...speedingEvents, ...safetyEvents]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { events, loading, error, reload: load };
}
