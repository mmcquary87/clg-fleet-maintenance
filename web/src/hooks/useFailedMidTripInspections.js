import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// A filed mid-trip inspection needs follow-up when it recorded a failed
// walkaround item (tractor) or an unresolved defect (trailer) and hasn't
// since been re-inspected and passed -- failed_items_repaired/
// reinspected_and_passed can be "No"/blank at filing time (the mechanic
// found something but hadn't fixed it yet), so this isn't just "any
// inspection with a Fail checklist entry," it's ones still open.
export function isMidTripFailed(insp) {
  if (insp.reinspected_and_passed === true) return false;
  const hasFailedItem = (insp.checklist ?? []).some((i) => i.status && i.status !== "ok");
  return insp.overall_result === "Fail" || hasFailedItem;
}

export function useFailedMidTripInspections() {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("mid_trip_inspections")
      .select("*, unit:units(id, number, type)")
      .eq("status", "filed")
      .or("reinspected_and_passed.is.null,reinspected_and_passed.eq.false")
      .order("inspected_at", { ascending: false });
    if (err) {
      setError(err.message);
      setInspections([]);
    } else {
      setInspections((data ?? []).filter(isMidTripFailed));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { inspections, loading, error, reload: load };
}
