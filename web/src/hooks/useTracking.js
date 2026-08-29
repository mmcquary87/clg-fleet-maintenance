import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { haversineMiles } from "../lib/haversine";

// Baseline cruising speed for the straight-line ETA floor, per CLG. Once
// Google Maps is wired in, the real ETA becomes
// max(distance / ASSUMED_MPH, Google's traffic-aware duration) — for now,
// with no traffic source connected, this constant is the only estimate.
export const ASSUMED_MPH = 55;

function fmtHM(minutes) {
  const abs = Math.round(Math.abs(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtClock(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

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
  const hosMarginMinutes = driveHoursNeeded != null && driveRemainingHours != null
    ? Math.round((driveRemainingHours - driveHoursNeeded) * 60)
    : null;

  // A window (FCFS) and an exact appointment (APPT) read differently to a
  // dispatcher — label which one this is rather than presenting both the
  // same way. Window takes precedence when both exist (matches the same
  // StopWindow-over-AppointmentDate precedence alvys-trips-report uses).
  const deadline = trip?.delivery_window_end || trip?.delivery_appointment_at || null;
  const deadlineType = trip?.delivery_window_end ? "window" : trip?.delivery_appointment_at ? "appointment" : null;
  const lateMarginMinutes = etaAt && deadline
    ? Math.round((new Date(deadline).getTime() - etaAt.getTime()) / 60000)
    : null;

  const hasEnoughData = etaAt != null;
  const hosShortfall = hosMarginMinutes != null && hosMarginMinutes < 0;
  const lateRisk = lateMarginMinutes != null && lateMarginMinutes < 0;

  // The layout groups on this, and each card leads with this sentence
  // instead of making the dispatcher do the math across separate columns.
  let severity = "no_data";
  let reason = "Missing position, destination, or HOS data — can't compute an ETA read yet.";
  if (hasEnoughData) {
    if (hosShortfall && lateRisk) {
      severity = "attention";
      reason = `Only ${fmtHM(driveRemainingHours * 60)} of drive time left but the trip still needs ${fmtHM(driveHoursNeeded * 60)} — expect a mandatory break, arriving after the ${fmtClock(new Date(deadline))} deadline.`;
    } else if (hosShortfall) {
      severity = "attention";
      reason = `Only ${fmtHM(driveRemainingHours * 60)} of drive time left, but the trip still needs ${fmtHM(driveHoursNeeded * 60)} — expect a mandatory break before arrival.`;
    } else if (lateRisk) {
      severity = "attention";
      reason = `ETA ${fmtClock(etaAt)} is ${fmtHM(lateMarginMinutes)} after the ${fmtClock(new Date(deadline))} deadline.`;
    } else if (lateMarginMinutes != null) {
      severity = "ok";
      reason = `On pace — ETA ${fmtClock(etaAt)}, ${fmtHM(lateMarginMinutes)} ahead of the ${fmtClock(new Date(deadline))} deadline.`;
    } else {
      severity = "ok";
      reason = `ETA ${fmtClock(etaAt)}. No delivery deadline on file to check against.`;
    }
  }

  return {
    distanceRemainingMiles, driveHoursNeeded, etaAt, driveRemainingHours,
    hosMarginMinutes, lateMarginMinutes, deadline, deadlineType, severity, reason,
  };
}

// Powers the Tracking page: every unit currently on an active load, its
// live position (from Samsara, refreshed every 15 min), its destination
// (from Alvys), and an HOS-aware risk read computed client-side from both.
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
      );

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

  // Grouped and sorted here, not in the view — the layout is a direct
  // reflection of this ordering, not a separate presentation decision.
  const attention = rows
    .filter((r) => r.eta.severity === "attention")
    .sort((a, b) => Math.min(a.eta.lateMarginMinutes ?? Infinity, a.eta.hosMarginMinutes ?? Infinity)
      - Math.min(b.eta.lateMarginMinutes ?? Infinity, b.eta.hosMarginMinutes ?? Infinity));
  const onTrack = rows
    .filter((r) => r.eta.severity === "ok")
    .sort((a, b) => (a.eta.etaAt?.getTime() ?? Infinity) - (b.eta.etaAt?.getTime() ?? Infinity));
  const noData = rows.filter((r) => r.eta.severity === "no_data");

  return {
    groups: { attention, onTrack, noData },
    total: rows.length,
    loading, error, reload: load,
  };
}
