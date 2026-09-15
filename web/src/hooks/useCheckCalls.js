import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Powers the check-call board on the Tracking tab: every call logged
// today, oldest first -- both the hourly coverage grid and each driver's
// call thread are pure aggregations over this one list (see
// lib/checkCallBoard.js), not separate queries.
export function useCheckCalls() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("check_calls")
      .select("id, unit_id, unit_number, driver_id, driver_name, alvys_trip_id, load_number, call_hour, logged_at, logged_by, note, free_time_expires_at, off_duty, created_at")
      .gte("call_hour", startOfToday().toISOString())
      .order("logged_at", { ascending: true });
    if (err) {
      setError(err.message);
      setCalls([]);
    } else {
      setCalls(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const logCall = useCallback(async (row) => {
    const { error: err } = await supabase.from("check_calls").insert(row);
    if (err) throw err;
    await load();
  }, [load]);

  return { calls, loading, error, reload: load, logCall };
}
