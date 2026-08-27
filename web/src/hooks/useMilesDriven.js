import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null
// Cost-per-mile needs a bounded window (it's an odometer delta), so this
// returns null (not 0) when there's no range selected — "All time" has no
// well-defined start reading to diff against.
export function useMilesDriven(range) {
  const [miles, setMiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!range?.start || !range?.end) {
      setMiles(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions.invoke("samsara-miles", {
      body: {
        startTime: new Date(range.start + "T00:00:00Z").toISOString(),
        endTime: new Date(range.end + "T23:59:59Z").toISOString(),
      },
    }).then(({ data, error: fnError }) => {
      if (cancelled) return;
      if (fnError) { setError(fnError.message); setMiles(null); }
      else if (data?.error) { setError(data.error); setMiles(null); }
      else { setMiles(data.totalMiles); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  return { miles, loading, error };
}
