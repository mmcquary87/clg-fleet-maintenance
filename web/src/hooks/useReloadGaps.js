import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { APPROVED_TARGETS } from "../lib/opsKpis";

// How far out "delivering soon" looks -- a driver whose delivery deadline
// falls inside this window is worth checking for a next load now, before
// they actually go empty. Arbitrary but reasonable; adjust freely.
const DELIVERING_SOON_HOURS = 24;

// A driver who DOES have a next trip queued isn't a gap just because one
// exists -- if the gap between "delivered" and "next pickup" is small,
// that's a normal reload turnaround, not something dispatch needs to chase.
// This is the line where an existing gap becomes worth surfacing.
const GAP_THRESHOLD_HOURS = 10;

// "Too much deadhead" reuses the CLG-approved Planned Empty Mile target
// (KPI 3, 17.0%) rather than inventing a separate number -- the same bar
// the fleet is already held to at the network level applies to one
// driver's next leg too.
const EMPTY_MILE_TARGET_PCT = APPROVED_TARGETS[3]?.target ?? 17.0;

function emptyMilePct(trip) {
  if (trip.empty_miles == null || trip.total_miles == null || trip.total_miles <= 0) return null;
  return (trip.empty_miles / trip.total_miles) * 100;
}

// Drivers who need dispatch's attention on their reload plan:
//  - "No plan": an active driver with zero Dispatched/In Transit trips in
//    Alvys right now -- driver-first, not unit-first, so a driver
//    temporarily without a truck (or whose truck's Alvys asset id hasn't
//    synced) still shows up instead of disappearing behind an idle truck.
//  - "Reload gap": a driver's current (In Transit) trip delivers within
//    DELIVERING_SOON_HOURS and either nothing is queued next, or the gap
//    between that delivery and the next trip's pickup exceeds
//    GAP_THRESHOLD_HOURS -- an actual hole in the schedule, not just "has
//    a next load eventually."
//  - "Long deadhead": a driver's next not-yet-picked-up trip has a planned
//    empty-mile percentage above the CLG-approved network target -- a
//    real load is booked, but it's an inefficient one worth a second look.
export function useReloadGaps() {
  const [noPlan, setNoPlan] = useState([]);
  const [gapAhead, setGapAhead] = useState([]);
  const [highDeadhead, setHighDeadhead] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: drivers, error: driversErr } = await supabase
      .from("drivers")
      .select("id, name, fleet_name")
      .eq("is_active", true);

    if (driversErr) {
      setError(driversErr.message);
      setNoPlan([]);
      setGapAhead([]);
      setHighDeadhead([]);
      setLoading(false);
      return;
    }

    const { data: trips, error: tripsErr } = await supabase
      .from("driver_active_trips")
      .select(
        "driver_id, alvys_trip_id, load_number, status, unit:units(id, number), " +
        "pickup_name, pickup_appointment_at, pickup_window_start, pickup_window_end, " +
        "delivery_name, delivery_appointment_at, delivery_window_end, empty_miles, loaded_miles, total_miles"
      );

    if (tripsErr) {
      setError(tripsErr.message);
      setNoPlan([]);
      setGapAhead([]);
      setHighDeadhead([]);
      setLoading(false);
      return;
    }

    const tripsByDriver = new Map();
    for (const t of trips ?? []) {
      if (!tripsByDriver.has(t.driver_id)) tripsByDriver.set(t.driver_id, []);
      tripsByDriver.get(t.driver_id).push(t);
    }
    // Ascending by pickup time -- an In Transit trip's pickup already
    // happened (in the past) so it naturally sorts before a Dispatched
    // trip's still-upcoming pickup, without needing a status special case.
    for (const list of tripsByDriver.values()) {
      list.sort((a, b) => {
        const av = new Date(a.pickup_window_start || a.pickup_appointment_at || 0).getTime();
        const bv = new Date(b.pickup_window_start || b.pickup_appointment_at || 0).getTime();
        return av - bv;
      });
    }

    const soonCutoff = Date.now() + DELIVERING_SOON_HOURS * 3600000;
    const withoutPlan = [];
    const gaps = [];
    const deadheads = [];

    for (const d of drivers ?? []) {
      const driverTrips = tripsByDriver.get(d.id) ?? [];
      if (driverTrips.length === 0) {
        withoutPlan.push(d);
        continue;
      }

      const current = driverTrips[0];
      const next = driverTrips[1] ?? null;

      if (current.status === "In Transit") {
        const deliveryDeadline = current.delivery_window_end || current.delivery_appointment_at;
        if (deliveryDeadline && new Date(deliveryDeadline).getTime() <= soonCutoff) {
          if (!next) {
            gaps.push({ driver: d, current, next: null, deadline: deliveryDeadline, gapHours: null });
          } else {
            const nextPickup = next.pickup_window_start || next.pickup_appointment_at;
            const gapHours = nextPickup
              ? (new Date(nextPickup).getTime() - new Date(deliveryDeadline).getTime()) / 3600000
              : null;
            if (gapHours == null || gapHours > GAP_THRESHOLD_HOURS) {
              gaps.push({ driver: d, current, next, deadline: deliveryDeadline, gapHours });
            }
          }
        }
      }

      // The soonest not-yet-picked-up trip in this driver's queue -- "current"
      // itself if they haven't started it yet, otherwise "next".
      const upcoming = current.status === "Dispatched" ? current : next?.status === "Dispatched" ? next : null;
      if (upcoming) {
        const pct = emptyMilePct(upcoming);
        if (pct != null && pct > EMPTY_MILE_TARGET_PCT) {
          deadheads.push({ driver: d, trip: upcoming, emptyMilePct: pct });
        }
      }
    }

    withoutPlan.sort((a, b) => a.name.localeCompare(b.name));
    gaps.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    deadheads.sort((a, b) => b.emptyMilePct - a.emptyMilePct);

    setNoPlan(withoutPlan);
    setGapAhead(gaps);
    setHighDeadhead(deadheads);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    noPlan, gapAhead, highDeadhead, loading, error, reload: load,
    DELIVERING_SOON_HOURS, GAP_THRESHOLD_HOURS, EMPTY_MILE_TARGET_PCT,
  };
}
