import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Rarely changes (admin-maintained lookup table), fetched once per mount —
// same spirit as useDriverNames but no cross-mount cache needed since this
// list is only ever consumed by the one incident-logging form at a time.
export function useAccountabilityInfractions() {
  const [infractions, setInfractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("accountability_infractions")
      .select("*")
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
