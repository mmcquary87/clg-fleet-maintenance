import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const EMPTY_RESULT = {
  miles: null, perUnit: [],
  matchedButNoDataCount: 0, matchedButNoDataSample: [],
  activeTrucks: 0, unmatchedTruckCount: 0, unmatchedTruckSample: [],
};

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null
// Cost-per-mile needs a bounded window (Alvys trip mileage is summed over
// a PickupDateRange/DeliveryDateRange), so this returns null (not 0) when
// there's no range selected — "All time" has no well-defined trip window
// to query.
export function useMilesDriven(range) {
  const [result, setResult] = useState(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!range?.start || !range?.end) {
      setResult(EMPTY_RESULT);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions.invoke("alvys-miles", {
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
        setResult(EMPTY_RESULT);
      } else if (data?.error) {
        setError(data.error);
        setResult(EMPTY_RESULT);
      } else {
        setResult({
          miles: data.totalMiles,
          perUnit: data.perUnit ?? [],
          matchedButNoDataCount: data.matchedButNoDataCount ?? 0,
          matchedButNoDataSample: data.matchedButNoDataSample ?? [],
          activeTrucks: data.activeTrucks ?? 0,
          unmatchedTruckCount: data.unmatchedTruckCount ?? 0,
          unmatchedTruckSample: data.unmatchedTruckSample ?? [],
        });
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  return { ...result, loading, error };
}
