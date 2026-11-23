import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Heavy/Severe speeding episodes that were probably coached in Samsara, as
// suggested Accountability incidents for a person to confirm. Samsara exposes
// no per-event coaching state for speeding, only completed coaching sessions
// per driver, so these are suggestions, never automatic: see
// 20261123030000_samsara_coaching_sessions.sql and
// 20261123040000_speeding_coaching_suggestions_view.sql.
//
// A suggestion disappears once it is logged (driver_incidents.samsara_event_id =
// its key) or dismissed (accountability_dismissed_suggestions).
export function useSpeedingCoachingSuggestions() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSuggestions = useCallback(
    () => supabase
      .from("speeding_coaching_suggestions")
      .select("*")
      .order("episode_start", { ascending: false }),
    [],
  );

  const apply = useCallback(({ data, error: err }) => {
    if (err) {
      setError(err.message);
      setSuggestions([]);
    } else {
      setError(null);
      setSuggestions(data ?? []);
    }
    setLoading(false);
  }, []);

  // Initial load: state is only set after the fetch resolves.
  useEffect(() => {
    let cancelled = false;
    fetchSuggestions().then((res) => { if (!cancelled) apply(res); });
    return () => { cancelled = true; };
  }, [fetchSuggestions, apply]);

  const load = useCallback(async () => {
    apply(await fetchSuggestions());
  }, [fetchSuggestions, apply]);

  // Confirm one suggestion: writes a normal driver_incidents row. The Samsara
  // coach is the issuer (they ran the coaching); the key makes it idempotent.
  const logIncident = async (s, { infractionId, stage }) => {
    const eventDate = new Date(s.episode_start).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const when = new Date(s.episode_start).toLocaleString("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const coachedAt = new Date(s.coached_at).toLocaleString("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const { error: err } = await supabase.from("driver_incidents").insert({
      driver_id: s.driver_id,
      event_date: eventDate,
      infraction_id: infractionId,
      coaching_stage: stage,
      notes: `Speeding episode ${when} ET, peak ${s.peak_over_mph} mph over the limit. Matched to a Samsara coaching session completed ${coachedAt} ET` +
        (s.basis === "named" ? " (behavior: " + s.samsara_behavior + ")" : " (behavior not specified in Samsara)") +
        ". Confirmed by a person in CLGOS.",
      issued_by: s.coach_name || `Samsara coach ${s.coach_id ?? "(unknown)"}`,
      samsara_event_id: s.suggestion_key,
    });
    if (err) return err;
    await load();
    return null;
  };

  const dismiss = async (s, userId) => {
    const { error: err } = await supabase
      .from("accountability_dismissed_suggestions")
      .insert({ suggestion_key: s.suggestion_key, dismissed_by: userId ?? null });
    if (err) return err;
    await load();
    return null;
  };

  return { suggestions, loading, error, reload: load, logIncident, dismiss };
}
