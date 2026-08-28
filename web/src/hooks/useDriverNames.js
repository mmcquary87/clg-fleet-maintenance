import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Returns [{ id, name }] — id is the real Alvys driver id when the name
// comes from the synced `drivers` table, null for names only seen
// elsewhere (unit assignments, existing roster/home-time entries,
// chargebacks) that haven't been matched to a synced driver yet.
export function useDriverNames() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [driversRes, unitsRes, rosterRes, homeTimeRes, chargebackRes] = await Promise.all([
        supabase.from("drivers").select("id, name"),
        supabase.from("units").select("driver_name").not("driver_name", "is", null),
        supabase.from("driver_roster").select("driver_name"),
        supabase.from("planned_home_time").select("driver_name"),
        supabase.from("work_orders").select("chargeback_driver_name").not("chargeback_driver_name", "is", null),
      ]);
      if (cancelled) return;

      const byName = new Map(); // name -> id (or null)
      (driversRes.data ?? []).forEach((d) => d.name && byName.set(d.name.trim(), d.id));
      const addNameOnly = (name) => {
        const trimmed = name?.trim();
        if (trimmed && !byName.has(trimmed)) byName.set(trimmed, null);
      };
      (unitsRes.data ?? []).forEach((r) => addNameOnly(r.driver_name));
      (rosterRes.data ?? []).forEach((r) => addNameOnly(r.driver_name));
      (homeTimeRes.data ?? []).forEach((r) => addNameOnly(r.driver_name));
      (chargebackRes.data ?? []).forEach((r) => addNameOnly(r.chargeback_driver_name));

      const opts = Array.from(byName.entries())
        .map(([name, id]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setOptions(opts);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { options, loading };
}
