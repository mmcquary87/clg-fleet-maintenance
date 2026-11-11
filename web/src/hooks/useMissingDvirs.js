import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const WINDOW_DAYS = 30; // matches Dvir.jsx's own defect window

// Rows here are "currently missing" by construction: samsara-sync-missing-dvirs
// deletes a row the moment a late pre-trip DVIR shows up covering it (see
// that function's reconcile step), so there's no resolved/open split to
// filter on the way Dvir.jsx has for defects.
export function useMissingDvirs() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

    const { data, error: err } = await supabase
      .from("missing_dvirs")
      .select("id, unit_id, samsara_vehicle_id, driver_id, samsara_driver_id, trip_start_time, trip_end_time, detected_at, unit:units(number, type), driver:drivers(name)")
      .gte("trip_start_time", since)
      .order("trip_start_time", { ascending: false });

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = {
    total: rows.length,
    driverCount: new Set(rows.map((r) => r.driver_id).filter(Boolean)).size,
    unlinkedDriverCount: rows.filter((r) => !r.driver_id).length,
  };

  return { rows, totals, loading, error, reload: load };
}
