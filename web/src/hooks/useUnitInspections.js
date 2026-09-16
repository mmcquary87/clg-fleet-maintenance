import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Filed inspections for one unit -- currently just mid_trip_inspections
// (the newest inspection type, and the one with no browsable view at all
// yet). tractor_inspections (assignment/return) could join in here later
// the same way if a unified "past inspections" list is wanted.
export function useUnitInspections(unitId) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("mid_trip_inspections")
      .select("*")
      .eq("unit_id", unitId)
      .eq("status", "filed")
      .order("inspected_at", { ascending: false });
    if (err) setError(err.message);
    else setInspections((data ?? []).map((row) => ({ ...row, inspection_kind: "Mid-trip" })));
    setLoading(false);
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  return { inspections, loading, error, reload: load };
}
