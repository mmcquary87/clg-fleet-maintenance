import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Drivers still signed in to a truck in the Samsara driver app after 48+ hours
// of not working (off duty / sleeper). See 20261123080000_driver_app_signout_flag.sql.
// No rows when nobody is overdue. A load failure is returned as `error`, never as
// "nobody flagged".
export function useDriverAppSignoutFlags() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("driver_app_signout_flags")
        .select("samsara_driver_id, driver_name, vehicle_name, duty_status, idle_since, hours_idle")
        .order("hours_idle", { ascending: false });
      if (cancelled) return;
      if (err) { setError(err.message); setFlags([]); } else { setFlags(data ?? []); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { flags, loading, error };
}
