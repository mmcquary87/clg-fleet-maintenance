import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Returns [{ id, name }] — id is the real Alvys driver id when the name
// comes from the synced `drivers` table, null for names only seen
// elsewhere (unit assignments, existing roster/home-time entries,
// chargebacks) that haven't been matched to a synced driver yet.
//
// Cached at module scope for the page's lifetime: this same 5-query batch
// was firing once per mounted picker (e.g. one ChargebackDriverPicker per
// work-order line item on NewWorkOrderForm — check 3 line items, get 15
// near-identical queries), for data that changes rarely. First mount
// fetches and populates the cache; every later mount (even a concurrent
// one, via the shared in-flight promise) reuses it instead of refetching.
let cache = null;
let inFlight = null;
let activeCache = null;
let activeInFlight = null;

// Active-only variant: just the synced `drivers` table filtered to
// is_active, no union with the other 4 sources -- those exist precisely to
// surface historical/unmatched names (old roster rows, old chargebacks,
// etc.), which is exactly the clutter a form that only wants current
// drivers (e.g. Log Incident) doesn't want back.
async function fetchActiveDriverNames() {
  const { data } = await supabase.from("drivers").select("id, name").eq("is_active", true);
  return (data ?? [])
    .filter((d) => d.name)
    .map((d) => ({ id: d.id, name: d.name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchDriverNames() {
  const [driversRes, unitsRes, rosterRes, homeTimeRes, chargebackRes] = await Promise.all([
    supabase.from("drivers").select("id, name"),
    supabase.from("units").select("driver_name").not("driver_name", "is", null),
    supabase.from("driver_roster").select("driver_name"),
    supabase.from("planned_home_time").select("driver_name"),
    supabase.from("work_orders").select("chargeback_driver_name").not("chargeback_driver_name", "is", null),
  ]);

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

  return Array.from(byName.entries())
    .map(([name, id]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useDriverNames({ activeOnly = false } = {}) {
  const [options, setOptions] = useState((activeOnly ? activeCache : cache) ?? []);
  const [loading, setLoading] = useState(!(activeOnly ? activeCache : cache));

  useEffect(() => {
    if (activeOnly) {
      if (activeCache) return; // an earlier mount already loaded this
      let cancelled = false;
      if (!activeInFlight) {
        activeInFlight = fetchActiveDriverNames()
          .then((opts) => { activeCache = opts; return opts; })
          .finally(() => { activeInFlight = null; });
      }
      activeInFlight.then((opts) => {
        if (!cancelled) {
          setOptions(opts);
          setLoading(false);
        }
      });
      return () => { cancelled = true; };
    }

    if (cache) return; // an earlier mount already loaded this
    let cancelled = false;
    if (!inFlight) {
      inFlight = fetchDriverNames()
        .then((opts) => { cache = opts; return opts; })
        .finally(() => { inFlight = null; });
    }
    inFlight.then((opts) => {
      if (!cancelled) {
        setOptions(opts);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeOnly]);

  return { options, loading };
}
