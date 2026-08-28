import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// `drivers` (synced from Alvys) is the real driver directory when it's
// populated — but also unions every driver name already seen anywhere
// else in the app (unit assignments, existing roster/home-time entries,
// chargebacks), so a name entered before the sync existed, or a driver
// not yet in Alvys, doesn't disappear from the list.
export function useDriverNames() {
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [driversRes, unitsRes, rosterRes, homeTimeRes, chargebackRes] = await Promise.all([
        supabase.from("drivers").select("name"),
        supabase.from("units").select("driver_name").not("driver_name", "is", null),
        supabase.from("driver_roster").select("driver_name"),
        supabase.from("planned_home_time").select("driver_name"),
        supabase.from("work_orders").select("chargeback_driver_name").not("chargeback_driver_name", "is", null),
      ]);
      if (cancelled) return;
      const set = new Set();
      (driversRes.data ?? []).forEach((r) => r.name && set.add(r.name.trim()));
      (unitsRes.data ?? []).forEach((r) => r.driver_name && set.add(r.driver_name.trim()));
      (rosterRes.data ?? []).forEach((r) => r.driver_name && set.add(r.driver_name.trim()));
      (homeTimeRes.data ?? []).forEach((r) => r.driver_name && set.add(r.driver_name.trim()));
      (chargebackRes.data ?? []).forEach((r) => r.chargeback_driver_name && set.add(r.chargeback_driver_name.trim()));
      setNames(Array.from(set).sort());
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { names, loading };
}
