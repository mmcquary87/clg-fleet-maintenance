import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// There's no canonical drivers table yet, so this unions every driver name
// already seen anywhere in the app — current unit assignments (Samsara),
// existing roster/home-time entries, and chargebacks — rather than only
// currently-assigned drivers, since the people most likely to need a
// roster entry (on leave, ineligible) are often NOT currently assigned to
// a unit. Grows more complete over time as more names get entered.
export function useDriverNames() {
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [unitsRes, rosterRes, homeTimeRes, chargebackRes] = await Promise.all([
        supabase.from("units").select("driver_name").not("driver_name", "is", null),
        supabase.from("driver_roster").select("driver_name"),
        supabase.from("planned_home_time").select("driver_name"),
        supabase.from("work_orders").select("chargeback_driver_name").not("chargeback_driver_name", "is", null),
      ]);
      if (cancelled) return;
      const set = new Set();
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
