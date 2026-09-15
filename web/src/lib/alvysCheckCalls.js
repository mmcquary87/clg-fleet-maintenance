// Fleet Maintenance System — real Alvys check-call helpers.
//
// Pure aggregation over two already-fetched lists: driver_active_trips
// (every currently Dispatched/In Transit trip, kept fresh by
// alvys-sync-active-trips) and alvys_check_calls (the real check-call
// history alvys-sync-check-calls pulls per trip). The trip list is the
// backbone -- a trip with zero calls logged yet still needs to show up
// as "no check call on file", not silently disappear.

export const STALE_THRESHOLD_HOURS = 2;

// CLG's own flat reference table for a rough drive-time-from-miles read.
// Optimistic past ~8h (ignores the 30-minute break / 14-hour on-duty
// limit) -- same caveat useTracking's real HOS math already carries.
export const MILES_TO_DRIVE_TIME_MPH = 60;
export const MILES_TO_DRIVE_TIME = [30, 60, 120, 300, 600].map((miles) => ({ miles, hours: miles / MILES_TO_DRIVE_TIME_MPH }));

export function fmtHoursAsClock(hours) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function groupByTrip(activeTrips, checkCalls) {
  const callsByTripId = new Map();
  for (const c of checkCalls) {
    if (!callsByTripId.has(c.trip_id)) callsByTripId.set(c.trip_id, []);
    callsByTripId.get(c.trip_id).push(c);
  }

  return activeTrips.map((trip) => {
    const calls = [...(callsByTripId.get(trip.alvys_trip_id) ?? [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const lastCall = calls.length > 0 ? calls[calls.length - 1] : null;
    return {
      tripId: trip.alvys_trip_id,
      unitId: trip.unit_id,
      unitNumber: trip.unit?.number ?? null,
      driverName: trip.driver?.name ?? trip.driver_name ?? null,
      loadNumber: trip.load_number,
      status: trip.status,
      calls,
      lastCall,
    };
  });
}

export function stalenessHours(lastCall, now = new Date()) {
  if (!lastCall) return Infinity;
  return (now.getTime() - new Date(lastCall.created_at).getTime()) / 3600000;
}

export function isStale(trip, now = new Date()) {
  return stalenessHours(trip.lastCall, now) > STALE_THRESHOLD_HOURS;
}

// Worst-first: no call on file at all sorts before merely-stale, which
// sorts before recently-called -- same "risk radar" ordering the live
// ETA table already uses, not an arbitrary list order.
export function sortByStaleness(trips, now = new Date()) {
  return [...trips].sort((a, b) => {
    const aHours = stalenessHours(a.lastCall, now);
    const bHours = stalenessHours(b.lastCall, now);
    return bHours - aHours;
  });
}

export function boardSummary(trips, now = new Date()) {
  const total = trips.length;
  const stale = trips.filter((t) => isStale(t, now));
  const neverCalled = trips.filter((t) => !t.lastCall);
  return { total, stale, neverCalled };
}
