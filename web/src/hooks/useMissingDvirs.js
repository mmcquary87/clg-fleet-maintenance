import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Default window when no range is picked: the same trailing 90 days as the
// official driver scorecard (driver_safety_scorecard), since each row here
// feeds that score.
const DEFAULT_WINDOW_DAYS = 90;

// Rows here are "currently missing" by construction: samsara-sync-missing-dvirs
// deletes a row the moment a late pre-trip DVIR shows up covering it (see
// that function's reconcile step), so there's no resolved/open split to
// filter on the way Dvir.jsx has for defects.
//
// range: { start: "YYYY-MM-DD" | null, end: "YYYY-MM-DD" | null } | null,
// the Driver Safety page's own date control (null = default window above).
//
// detectionStart: the earliest shift in the table. Automatic detection began
// partway through the scoring window, so any range reaching back before this
// date silently can't have rows for those days -- surfaced so an empty early
// period reads as "not tracked yet", not "no missing DVIRs".
export function useMissingDvirs(range = null) {
  const [rows, setRows] = useState([]);
  const [detectionStart, setDetectionStart] = useState(null);
  // First day of the window actually queried (the default 90-day window is
  // resolved here, once per load, not recomputed during render).
  const [windowStartDate, setWindowStartDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const rangeStart = range?.start ?? null;
  const rangeEnd = range?.end ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = rangeStart
      ? `${rangeStart}T00:00:00`
      : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    setWindowStartDate(since.slice(0, 10));

    let query = supabase
      .from("missing_dvirs")
      .select("id, unit_id, samsara_vehicle_id, driver_id, samsara_driver_id, trip_start_time, trip_end_time, detected_at, unit:units(number, type), driver:drivers(name)")
      .gte("trip_start_time", since)
      .order("trip_start_time", { ascending: false });
    if (rangeEnd) query = query.lte("trip_start_time", `${rangeEnd}T23:59:59.999`);

    const [{ data, error: err }, { data: earliest }] = await Promise.all([
      query,
      supabase.from("missing_dvirs").select("trip_start_time").order("trip_start_time", { ascending: true }).limit(1),
    ]);

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setDetectionStart(earliest?.[0]?.trip_start_time ?? null);
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = {
    total: rows.length,
    driverCount: new Set(rows.map((r) => r.driver_id).filter(Boolean)).size,
    unlinkedDriverCount: rows.filter((r) => !r.driver_id).length,
  };

  return { rows, totals, detectionStart, windowStartDate, loading, error, reload: load };
}
