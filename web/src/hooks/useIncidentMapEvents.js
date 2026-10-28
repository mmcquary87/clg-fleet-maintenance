import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAccountabilityInfractions } from "./useAccountabilityInfractions";
import { buildScoringIndex } from "../lib/accountabilityScoring";

const WINDOW_DAYS = 90; // matches driver_safety_scorecard's scoring window

// Three tiers across both event types, on our own point scale (max 2.0),
// not the old Power BI report's unrelated raw-point scale.
function severityTier(weight) {
  if (weight >= 1.5) return "high";
  if (weight >= 0.75) return "moderate";
  return "minor";
}

function safetyEventWeight(index, behaviorLabels) {
  let max = 0;
  for (const label of behaviorLabels ?? []) {
    const hit = index.matchSafetyLabel(label?.name);
    if (hit) max = Math.max(max, hit.weight);
  }
  return max;
}

export function useIncidentMapEvents() {
  const { infractions, loading: infractionsLoading } = useAccountabilityInfractions();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (infractionsLoading) return;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const index = buildScoringIndex(infractions);

    const [speedingRes, safetyRes] = await Promise.all([
      supabase
        .from("driver_speeding_intervals")
        .select("id, start_time, severity_level, latitude, longitude, driver:drivers(name)")
        .gte("start_time", since)
        .not("latitude", "is", null)
        .eq("is_dismissed", false),
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
      const weight = index.matchSpeedingSeverity(r.severity_level)?.weight ?? 0;
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
        const weight = safetyEventWeight(index, r.behavior_labels);
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
  }, [infractions, infractionsLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, loading, error, reload: load };
}
