import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { haversineMiles } from "../lib/haversine";

// Baseline cruising speed for the straight-line ETA floor, per CLG. Once
// Google Maps is wired in, the real ETA becomes
// max(distance / ASSUMED_MPH, Google's traffic-aware duration) — for now,
// with no traffic source connected, this constant is the only estimate.
export const ASSUMED_MPH = 55;

function computeEta(unit, trip, hos) {
  const hasPosition = typeof unit.current_lat === "number" && typeof unit.current_lng === "number";
  const hasDestination = typeof trip?.destination_lat === "number" && typeof trip?.destination_lng === "number";

  const distanceRemainingMiles = hasPosition && hasDestination
    ? haversineMiles(unit.current_lat, unit.current_lng, trip.destination_lat, trip.destination_lng)
    : null;

  const driveHoursNeeded = distanceRemainingMiles != null ? distanceRemainingMiles / ASSUMED_MPH : null;
  const etaAt = driveHoursNeeded != null ? new Date(Date.now() + driveHoursNeeded * 3600000) : null;

  const driveRemainingHours = typeof hos?.drive_remaining_minutes === "number"
    ? hos.drive_remaining_minutes / 60
    : null;

  // Not a full HOS reset simulator (11-hour driving / 14-hour window /
  // 10-hour break / 34-hour restart rules) — just the one flag a
  // dispatcher actually needs at a glance: "does this driver have enough
  // drive-clock left to cover the remaining distance without a forced stop."
  const hosShortfall = driveHoursNeeded != null && driveRemainingHours != null
    ? driveHoursNeeded > driveRemainingHours
    : null;

  const deadline = trip?.delivery_window_end || trip?.delivery_appointment_at || null;
  const lateRisk = etaAt && deadline ? etaAt.getTime() > new Date(deadline).getTime() : null;

  return { distanceRemainingMiles, driveHoursNeeded, etaAt, driveRemainingHours, hosShortfall, lateRisk, deadline };
}

// Powers the Tracking page: every unit currently on an active load, its
// live position (from Samsara, refreshed every 15 min), its destination
// (from Alvys, once alvys-sync-active-trips exists), and an HOS-aware ETA
// computed client-side from both. unit_current_trip / unit_hos_status are
// empty until those sync functions are built — see the migration comment
// in 20260829000000_proactive_tracking.sql for why.
export function useTracking() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("unit_current_trip")
      .select(
        "alvys_trip_id, destination_name, destination_lat, destination_lng, " +
        "delivery_appointment_at, delivery_window_end, status, synced_at, " +
        "unit:units(id, number, current_lat, current_lng, current_location, samsara_synced_at, driver_name), " +
        "driver:drivers(id, name)"
      )
      .order("delivery_window_end", { ascending: true, nullsFirst: false });

    if (err) {
      setError(err.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const unitIds = (data ?? []).map((t) => t.unit?.id).filter(Boolean);
    let hosByUnitId = new Map();
    if (unitIds.length > 0) {
      const { data: hosRows } = await supabase
        .from("unit_hos_status")
        .select("unit_id, duty_status, drive_remaining_minutes, shift_remaining_minutes, cycle_remaining_minutes")
        .in("unit_id", unitIds);
      hosByUnitId = new Map((hosRows ?? []).map((h) => [h.unit_id, h]));
    }

    const computed = (data ?? [])
      .filter((trip) => trip.unit)
      .map((trip) => {
        const hos = hosByUnitId.get(trip.unit.id) ?? null;
        return { trip, unit: trip.unit, hos, eta: computeEta(trip.unit, trip, hos) };
      });

    setRows(computed);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, loading, error, reload: load };
}
