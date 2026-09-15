import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Powers the Check Calls sub-tab: every currently-active trip
// (driver_active_trips, kept fresh by alvys-sync-active-trips) plus the
// real check-call history alvys-sync-check-calls has pulled for each one.
// Read-only -- there is no write path here, matching CLG's own spec
// (CLG OS reads check calls, it never logs them into Alvys).
export function useAlvysCheckCalls() {
  const [activeTrips, setActiveTrips] = useState([]);
  const [checkCalls, setCheckCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tripsRes, callsRes] = await Promise.all([
      supabase.from("driver_active_trips")
        .select("alvys_trip_id, load_number, unit_id, status, driver:drivers(id, name), unit:units(id, number)"),
      supabase.from("alvys_check_calls")
        .select("id, trip_id, load_number, trip_number, description, activity, response_type, driver_name, location_address, location_lat, location_lng, reefer_setpoint_temp, reefer_return_temp, created_at, created_by, unit_id")
        .order("created_at", { ascending: true }),
    ]);

    if (tripsRes.error) {
      setError(tripsRes.error.message);
      setActiveTrips([]);
      setCheckCalls([]);
      setLoading(false);
      return;
    }
    if (callsRes.error) {
      setError(callsRes.error.message);
      setActiveTrips([]);
      setCheckCalls([]);
      setLoading(false);
      return;
    }

    setActiveTrips(tripsRes.data ?? []);
    setCheckCalls(callsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { activeTrips, checkCalls, loading, error, reload: load };
}
