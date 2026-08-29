const EARTH_RADIUS_MILES = 3958.8;

// Straight-line ("as the crow flies") distance in miles. A stand-in for
// real road-routed distance until Google Maps is wired in — always an
// underestimate of actual driving distance, so treat the ETA built from
// this as a floor, not a promise.
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
