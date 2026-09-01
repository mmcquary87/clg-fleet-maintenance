import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null
// Cost-per-mile needs a bounded window (it's an odometer delta), so this
// returns null (not 0) when there's no range selected — "All time" has no
// well-defined start reading to diff against.
export function useMilesDriven(range) {
  const [miles, setMiles] = useState(null);
  const [perUnit, setPerUnit] = useState([]);
  const [matchedButNoDataCount, setMatchedButNoDataCount] = useState(0);
  const [matchedButNoDataSample, setMatchedButNoDataSample] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!range?.start || !range?.end) {
      setMiles(null);
      setPerUnit([]);
      setMatchedButNoDataCount(0);
      setMatchedButNoDataSample([]);
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
    }).then(async ({ data, error: fnError }) => {
      if (cancelled) return;
      if (fnError) {
        // supabase-js's FunctionsHttpError.message is just "Edge Function
        // returned a non-2xx status code" -- the function's own {error}
        // body (the actually useful message) is on .context, a Response.
        let message = fnError.message;
        try {
          const body = await fnError.context?.json();
          if (body?.error) message = body.error;
        } catch { /* context wasn't JSON -- keep the generic message */ }
        setError(message);
        setMiles(null);
        setPerUnit([]);
        setMatchedButNoDataCount(0);
        setMatchedButNoDataSample([]);
      } else if (data?.error) {
        setError(data.error);
        setMiles(null);
        setPerUnit([]);
        setMatchedButNoDataCount(0);
        setMatchedButNoDataSample([]);
      } else {
        setMiles(data.totalMiles);
        setPerUnit(data.perUnit ?? []);
        setMatchedButNoDataCount(data.matchedButNoDataCount ?? 0);
        setMatchedButNoDataSample(data.matchedButNoDataSample ?? []);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  return { miles, perUnit, matchedButNoDataCount, matchedButNoDataSample, loading, error };
}
