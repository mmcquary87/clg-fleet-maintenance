import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
// Backs KPI 11 (Driver Utilization %) — see alvys-driver-utilization for
// the methodology (governed driver_roster exception list for availability
// x Alvys trip activity for productive days).
export function useDriverUtilization(range) {
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
    supabase.functions.invoke("alvys-driver-utilization", {
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
