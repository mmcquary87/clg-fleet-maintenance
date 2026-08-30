import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
// Backs KPI 13 (Average Daily Drive-Hour Utilization %) — see
// samsara-drive-hour-utilization for the methodology (legal 11 hr/day
// ceiling x working days, not a roster-scheduled-hours concept).
export function useDriveHourUtilization(range) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!range?.start || !range?.end) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions.invoke("samsara-drive-hour-utilization", {
      body: { startDate: range.start, endDate: range.end },
    }).then(({ data: res, error: fnError }) => {
      if (cancelled) return;
      if (fnError) { setError(fnError.message); setData(null); }
      else if (res?.error) { setError(res.error); setData(null); }
      else { setData(res); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  return { data, loading, error };
}
