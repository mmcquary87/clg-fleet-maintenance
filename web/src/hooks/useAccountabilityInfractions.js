import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Rarely changes (admin-maintained lookup table), fetched once per mount —
// same spirit as useDriverNames but no cross-mount cache needed since this
// list is only ever consumed by the one incident-logging form at a time.
//
// Embeds accountability_infraction_patterns so accountabilityScoring.js's
// buildScoringIndex() can be built from this same fetch wherever a
// Samsara-label-to-infraction lookup is needed (useDriverPointBreakdown,
// useIncidentMapEvents) instead of a second hardcoded copy of the weights.
export function useAccountabilityInfractions() {
  const [infractions, setInfractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("accountability_infractions")
      .select("*, accountability_infraction_patterns(match_type, match_value)")
      .eq("active", true)
      .order("violation_family", { ascending: true })
      .order("name", { ascending: true });

    if (err) {
      setError(err.message);
      setInfractions([]);
    } else {
      setInfractions(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { infractions, loading, error };
}
