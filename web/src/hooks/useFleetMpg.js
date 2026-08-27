import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
export function useFleetMpg(range) {
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
    supabase.functions.invoke("samsara-fleet-mpg", {
      body: {
        startDate: new Date(range.start + "T00:00:00Z").toISOString(),
        endDate: new Date(range.end + "T23:59:59Z").toISOString(),
      },
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
