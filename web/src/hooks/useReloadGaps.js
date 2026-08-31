import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// How far out "delivering soon" looks -- a truck whose delivery deadline
// falls inside this window is worth checking for a next load now, before
// it actually goes empty. Arbitrary but reasonable; adjust freely.
const DELIVERING_SOON_HOURS = 24;

// Trucks that need attention from a load-planning standpoint:
//  - "No plan": an active, road-worthy truck with no row in
//    unit_current_trip at all -- Alvys has no Dispatched or In Transit
//    trip for it, so nothing is booked.
//  - "Delivering soon": currently on a Delivery leg (already picked up)
//    whose deadline is within DELIVERING_SOON_HOURS. This does NOT mean
//    it has no next load -- alvys-sync-active-trips keeps only the single
//    most relevant trip per unit (In Transit over Dispatched), so a
//    already-booked next leg wouldn't show up here even if one exists.
//    It's a "worth checking" flag, not proof of a gap.
export function useReloadGaps() {
  const [noPlan, setNoPlan] = useState([]);
  const [deliveringSoon, setDeliveringSoon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: units, error: unitsErr } = await supabase
      .from("units")
      .select("id, number, type, current_location, driver_name, can_move_load")
      .eq("type", "Truck")
      .eq("is_active", true)
      .or("can_move_load.is.null,can_move_load.eq.true");

    if (unitsErr) {
      setError(unitsErr.message);
      setNoPlan([]);
      setDeliveringSoon([]);
      setLoading(false);
      return;
    }

    const { data: trips, error: tripsErr } = await supabase
      .from("unit_current_trip")
      .select("unit_id, load_number, stop_type, stop_name, stop_appointment_at, stop_window_end, driver:drivers(name)");

    if (tripsErr) {
      setError(tripsErr.message);
      setNoPlan([]);
      setDeliveringSoon([]);
      setLoading(false);
      return;
    }

    const tripByUnitId = new Map((trips ?? []).map((t) => [t.unit_id, t]));
    const soonCutoff = Date.now() + DELIVERING_SOON_HOURS * 3600000;

    const withoutPlan = [];
    const soon = [];
    for (const u of units ?? []) {
      const trip = tripByUnitId.get(u.id);
      if (!trip) {
        withoutPlan.push(u);
        continue;
      }
      if (trip.stop_type !== "Delivery") continue;
      const deadline = trip.stop_window_end || trip.stop_appointment_at;
      if (deadline && new Date(deadline).getTime() <= soonCutoff) {
        soon.push({ unit: u, trip, deadline });
      }
    }

    withoutPlan.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    soon.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    setNoPlan(withoutPlan);
    setDeliveringSoon(soon);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { noPlan, deliveringSoon, loading, error, reload: load, DELIVERING_SOON_HOURS };
}
