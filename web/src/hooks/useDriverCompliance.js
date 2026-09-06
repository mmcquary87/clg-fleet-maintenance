import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Reads the drivers table's Alvys-synced license/medical expiration dates
// -- gated at the RLS level to admin/dispatcher (see
// 20260906010000_driver_compliance_rls.sql), same as this view is gated
// out of the mechanic role's nav in RosterView.jsx.
export function useDriverCompliance() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("drivers")
      .select("id, name, employee_id, license_expires_at, medical_expires_at")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (err) {
      setError(err.message);
      setDrivers([]);
    } else {
      setDrivers(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { drivers, loading, error, reload: load };
}
