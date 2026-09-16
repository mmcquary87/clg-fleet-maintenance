// Samsara's reverseGeo.formattedLocation (units.current_location) is a
// full street address computed from the vehicle's own GPS reading (see
// samsara-sync's own comment on why that's preferred over its
// address-book name fallback, which can be a stale/unrelated saved
// place). For dispatch/ops purposes the street-level detail is more
// than needed -- city and state is enough to know roughly where a unit
// is. Not a geocoding call, just a pattern match against the standard
// "..., City, ST 12345[, USA]" tail US addresses come back in; falls
// back to the full address if it doesn't match rather than guessing.
const CITY_STATE_PATTERN = /(?:^|,\s*)([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*USA)?\s*$/;

export function cityStateFromAddress(address) {
  if (!address) return null;
  const match = address.match(CITY_STATE_PATTERN);
  return match ? `${match[1].trim()}, ${match[2]}` : address;
}
