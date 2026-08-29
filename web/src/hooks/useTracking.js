import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { haversineMiles } from "../lib/haversine";

// Baseline cruising speed for the drive-time-needed proxy, per CLG. This
// stands in for real routed duration (D in late-load-exposure-calc-spec.md)
// until Google Maps is connected — see "Routing provider — not yet
// connected" in that spec. Once wired in, D becomes
// max(distance / ASSUMED_MPH, Google's traffic-aware duration).
export const ASSUMED_MPH = 55;

// late-load-exposure-calc-spec.md's v1 algorithm constants.
const MAX_DRIVE_PER_RESET_HOURS = 11; // property-carrying max drive/day
const RESET_HOURS = 10; // default assumption — split-sleeper not modeled

const ASSUMPTIONS = {
  resetHoursAssumed: RESET_HOURS,
  maxDrivePerCycleHours: MAX_DRIVE_PER_RESET_HOURS,
  routeSource: "straight_line_55mph", // becomes "google_directions" once connected
  hosSource: "samsara_hos_clocks",
};

function fmtHM(hours) {
  const abs = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtClock(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// v1 algorithm from late-load-exposure-calc-spec.md: given drive-time-needed
// D and drive-clock-remaining A, project total elapsed hours including any
// mandatory 10-hour resets — not just D itself, which is what the old
// straight-line ETA got wrong (it assumed a driver can keep driving past
// their legal limit). Returns { totalHours, resetsNeeded }.
function projectDriveTime(driveHoursNeeded, driveRemainingHours) {
  if (driveHoursNeeded <= driveRemainingHours) {
    return { totalHours: driveHoursNeeded, resetsNeeded: 0 };
  }
  const remainingAfterFirstLeg = driveHoursNeeded - driveRemainingHours;
  const resetsNeeded = Math.ceil(remainingAfterFirstLeg / MAX_DRIVE_PER_RESET_HOURS);
  const totalHours = driveRemainingHours + resetsNeeded * RESET_HOURS + remainingAfterFirstLeg;
  return { totalHours, resetsNeeded };
}

// Draft, unapproved cutoffs (late-load-exposure-calc-spec.md: "needs
// Ops/Safety sign-off... before DE-01 activates with any status color").
// Used here only to label/sort within "Needs attention," not as an
// officially sanctioned status color.
function severityTierFor(hoursShort) {
  if (hoursShort > 10) return "Critical";
  if (hoursShort >= 5) return "Warning";
  if (hoursShort > 0) return "Watch";
  return "On pace";
}

function computeEta(unit, trip, hos) {
  const hasPosition = typeof unit.current_lat === "number" && typeof unit.current_lng === "number";
  const hasDestination = typeof trip?.destination_lat === "number" && typeof trip?.destination_lng === "number";

  const distanceRemainingMiles = hasPosition && hasDestination
    ? haversineMiles(unit.current_lat, unit.current_lng, trip.destination_lat, trip.destination_lng)
    : null;

  // D — drive time still needed (straight-line proxy, see ASSUMPTIONS above).
  const driveHoursNeeded = distanceRemainingMiles != null ? distanceRemainingMiles / ASSUMED_MPH : null;
  // A — driver's remaining legal drive-clock, from Samsara HOS.
  const driveRemainingHours = typeof hos?.drive_remaining_minutes === "number"
    ? hos.drive_remaining_minutes / 60
    : null;

  let projectedArrival = null;
  let resetsNeeded = 0;
  if (driveHoursNeeded != null && driveRemainingHours != null) {
    const projection = projectDriveTime(driveHoursNeeded, driveRemainingHours);
    resetsNeeded = projection.resetsNeeded;
    projectedArrival = new Date(Date.now() + projection.totalHours * 3600000);
  }

  // A window (FCFS) and an exact appointment (APPT) read differently to a
  // dispatcher — label which one this is rather than presenting both the
  // same way. Window takes precedence when both exist (matches the same
  // StopWindow-over-AppointmentDate precedence alvys-trips-report uses).
  const deadline = trip?.delivery_window_end || trip?.delivery_appointment_at || null;
  const deadlineType = trip?.delivery_window_end ? "window" : trip?.delivery_appointment_at ? "appointment" : null;
  // A point-in-time appointment has no separate window to run up to — the
  // "runway to react" is just the time until that one instant.
  const windowStart = trip?.delivery_window_start || deadline;

  const hoursShort = projectedArrival && deadline
    ? Math.max(0, (projectedArrival.getTime() - new Date(deadline).getTime()) / 3600000)
    : null;
  const bufferHours = projectedArrival && deadline
    ? Math.max(0, (new Date(deadline).getTime() - projectedArrival.getTime()) / 3600000)
    : null;
  // Signed version of the same read (ui-improvement-punch-list.md's "ETA
  // Cushion" column) — positive means ahead of the deadline, negative means
  // short of it. hoursShort/bufferHours stay as-is (each clamped to >= 0)
  // since severityTierFor and the sort order above already depend on them.
  const cushionHours = projectedArrival && deadline
    ? (new Date(deadline).getTime() - projectedArrival.getTime()) / 3600000
    : null;
  const leadTimeHours = windowStart ? (new Date(windowStart).getTime() - Date.now()) / 3600000 : null;
  const severityTier = hoursShort != null ? severityTierFor(hoursShort) : null;

  // The layout groups on this, and each card/row leads with this sentence
  // instead of making the dispatcher do the math across separate columns.
  let severity = "no_data";
  let reason = "Missing position, destination, or HOS data — can't compute an ETA read yet.";
  if (projectedArrival) {
    if (hoursShort > 0) {
      severity = "attention";
      reason = resetsNeeded > 0
        ? `Needs ${resetsNeeded > 1 ? `${resetsNeeded} required resets` : "a required 10-hour reset"} before it can finish the drive — projected ${fmtHM(hoursShort)} short of the ${fmtClock(new Date(deadline))} deadline.`
        : `Projected ${fmtHM(hoursShort)} short of the ${fmtClock(new Date(deadline))} deadline.`;
    } else if (deadline) {
      severity = "ok";
      reason = `On pace — projected arrival ${fmtClock(projectedArrival)}, ${fmtHM(bufferHours)} ahead of the ${fmtClock(new Date(deadline))} deadline.`;
    } else {
      severity = "ok";
      reason = `Projected arrival ${fmtClock(projectedArrival)}. No delivery deadline on file to check against.`;
    }
  } else if (driveHoursNeeded != null && driveRemainingHours == null) {
    reason = "Missing this driver's HOS clocks — can't rule out a mandatory reset before arrival.";
  }

  return {
    // Explicit per-field availability, not just inferred from nulls
    // downstream — the "No GPS" / "No appointment" / "HOS risk" Tracking
    // filters (ui-improvement-punch-list.md) each need to isolate one of
    // these independent of whether an ETA could be computed overall.
    hasPosition, hasDestination, hasHos: driveRemainingHours != null, hasAppointment: deadline != null,
    distanceRemainingMiles, driveHoursNeeded, driveRemainingHours,
    projectedArrival, resetsNeeded, deadline, deadlineType, windowStart,
    hoursShort, bufferHours, cushionHours, leadTimeHours, severityTier,
    severity, reason, assumptions: ASSUMPTIONS,
  };
}

// Powers the Tracking page: every unit currently on an active load, its
// live position (from Samsara, refreshed every 15 min), its destination
// (from Alvys), and a Late Load Exposure projection (see
// late-load-exposure-calc-spec.md) computed client-side from both.
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
        "alvys_trip_id, load_number, destination_name, destination_lat, destination_lng, " +
        "delivery_appointment_at, delivery_window_start, delivery_window_end, status, synced_at, " +
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
  // "Needs attention" sorts by hoursShort descending (worst first), per
  // late-load-exposure-calc-spec.md.
  const attention = rows
    .filter((r) => r.eta.severity === "attention")
    .sort((a, b) => (b.eta.hoursShort ?? 0) - (a.eta.hoursShort ?? 0));
  // Tightest cushion first — this is a risk radar, not a dock schedule, so
  // it should read as a continuation of "Needs attention"'s worst-first
  // order rather than switching to arrival time. A load with no deadline on
  // file has no buffer to rank by, so it sorts to the end.
  const onTrack = rows
    .filter((r) => r.eta.severity === "ok")
    .sort((a, b) => (a.eta.bufferHours ?? Infinity) - (b.eta.bufferHours ?? Infinity));
  // Nearest known deadline first — a missing-data load with an appointment
  // coming up is more urgent to chase down than one with nothing on file.
  const noData = rows
    .filter((r) => r.eta.severity === "no_data")
    .sort((a, b) => (a.eta.deadline ? new Date(a.eta.deadline).getTime() : Infinity) - (b.eta.deadline ? new Date(b.eta.deadline).getTime() : Infinity));

  // Single worst-first ordering across all three groups (ui-improvement-
  // punch-list.md's Tracking rebuild: one dense table, not three sections) —
  // attention's negative cushion sorts before onTrack's positive cushion
  // naturally; noData's null cushion has nothing to rank by, so it goes last.
  const allSorted = [...attention, ...onTrack, ...noData];

  return {
    rows: allSorted,
    groups: { attention, onTrack, noData },
    total: rows.length,
    loading, error, reload: load,
  };
}
