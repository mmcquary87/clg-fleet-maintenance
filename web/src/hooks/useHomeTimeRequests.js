import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Backs both the driver-facing "Request home time" view and the
// dispatcher-facing Requests tab in HomeTimeView -- same query for both,
// since RLS already scopes the result set (a driver login only ever gets
// back their own rows, staff get every row). See
// 20261010010000_driver_home_time_requests.sql for the policy.
export function useHomeTimeRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("home_time_requests")
      .select("*, driver:drivers(name)")
      .order("requested_at", { ascending: false });
    if (err) {
      setError(err.message);
      setRequests([]);
    } else {
      setRequests(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitRequest = async ({ driverId, startDate, endDate, reason }) => {
    const { error: err } = await supabase.from("home_time_requests").insert({
      driver_id: driverId,
      start_date: startDate,
      end_date: endDate,
      reason: reason?.trim() || null,
    });
    if (err) throw err;
    await load();
  };

  const decide = async (id, status, { decidedBy, note }) => {
    const { error: err } = await supabase.from("home_time_requests").update({
      status,
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    }).eq("id", id);
    if (err) throw err;
    await load();
  };

  return { requests, loading, error, reload: load, submitRequest, decide };
}
