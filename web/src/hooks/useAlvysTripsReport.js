import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
// Backs Empty Mile %, On-Time Pickup, On-Time Delivery, Revenue per
// Active Tractor per Week, and Revenue Miles per Active Driver per Week —
// all computed server-side from Alvys's trips/search (see
// alvys-trips-report). Bare dates, not full timestamps: the function's
// PickupDateRange/DeliveryDateRange filter takes YYYY-MM-DD directly.
export function useAlvysTripsReport(range) {
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
    supabase.functions.invoke("alvys-trips-report", {
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
