import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Mid-trip inspections saved as a draft (see MidTripInspectionForm's "Save
// as draft") -- these persist to the table same as a filed one, but until
// now had no list anywhere to find them again (the Unit page's "Filed
// inspections" panel only ever queried status='filed').
export function useDraftMidTripInspections() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("mid_trip_inspections")
      .select("id, unit_id, unit_type, inspected_at, mechanic_name, unit:units(id, number)")
      .eq("status", "draft")
      .order("inspected_at", { ascending: false });
    if (err) {
      setError(err.message);
      setDrafts([]);
    } else {
      setDrafts(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { drafts, loading, error, reload: load };
}
