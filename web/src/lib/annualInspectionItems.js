// Fleet Maintenance System — Annual (DOT) Inspection checklist definitions.
//
// Item groups follow 49 CFR Part 396, Appendix A ("Minimum Periodic
// Inspection Standards"), split into a truck-tractor set and a trailer
// set since the required systems differ (e.g. trailers get no exhaust/
// fuel-system/steering items; tractors get no van-body item). Every item
// is boolean: true = OK, false = a defect. `category`/`severity` are what
// a work order raised from a false item gets stamped with -- a first-pass
// mapping onto the wo_category enum (none fit perfectly; adjust here if
// CLG wants different categories, this is the one place that mapping
// lives). All items default to "Urgent" severity -- these are roadworthiness
// safety systems, not paperwork.

export const TRACTOR_ITEMS = [
  { key: "brake_system", label: "Brake system", sublabel: "Service brakes, parking brake, drums/rotors, hoses/tubing, low-air warning device, air compressor", category: "Brakes" },
  { key: "coupling_devices", label: "Coupling devices", sublabel: "Fifth wheel mounting, locking mechanism, safety devices", category: "Body / Structural" },
  { key: "exhaust_system", label: "Exhaust system", sublabel: "No leaks, not contacting fuel system or wiring", category: "Engine" },
  { key: "frame", label: "Frame", sublabel: "Frame members not cracked or bent, tire/wheel clearance", category: "Body / Structural" },
  { key: "fuel_system", label: "Fuel system", sublabel: "No leaks, cap secure, system secured", category: "Engine" },
  { key: "lighting_devices", label: "Lighting devices", sublabel: "All required lamps and reflectors operable", category: "Electrical" },
  { key: "steering_mechanism", label: "Steering mechanism", sublabel: "Free play, column, gear box, pitman arm, power steering, ball/socket joints, tie rods/drag links", category: "Suspension" },
  { key: "suspension", label: "Suspension", sublabel: "U-bolts, spring hangers, leaf springs, air suspension", category: "Suspension" },
  { key: "tires", label: "Tires", sublabel: "Tread depth, no cuts/bulges, properly inflated", category: "Tires" },
  { key: "wheels_rims", label: "Wheels and rims", sublabel: "No cracks, lug nuts tight, no loose/missing fasteners", category: "Tires" },
  { key: "windshield_glazing", label: "Windshield glazing", sublabel: "No cracks obstructing the driver's view", category: "Body / Structural" },
  { key: "windshield_wipers", label: "Windshield wipers", sublabel: "Functioning", category: "Electrical" },
];

export const TRAILER_ITEMS = [
  { key: "coupling_devices", label: "Coupling devices", sublabel: "Kingpin/upper coupler plate, pintle hook or other device, safety devices", category: "Body / Structural" },
  { key: "brake_system", label: "Brake system", sublabel: "Service brakes, drums/linings, hoses/tubing", category: "Brakes" },
  { key: "frame", label: "Frame", sublabel: "Frame/body members not cracked or sagging", category: "Body / Structural" },
  { key: "lighting_devices", label: "Lighting devices", sublabel: "All required lamps and reflectors operable", category: "Electrical" },
  { key: "suspension", label: "Suspension", sublabel: "Springs, axle mounting, air suspension", category: "Suspension" },
  { key: "tires", label: "Tires", sublabel: "Tread depth, no cuts/bulges, properly inflated", category: "Tires" },
  { key: "wheels_rims", label: "Wheels and rims", sublabel: "No cracks, lug nuts tight, no loose/missing fasteners", category: "Tires" },
  { key: "van_body", label: "Van / open-top body", sublabel: "Floor sound, doors operate and latch, no holes compromising cargo", category: "Body / Structural" },
];

export function itemsForUnitType(unitType) {
  return unitType === "Trailer" ? TRAILER_ITEMS : TRACTOR_ITEMS;
}

export function countChecked(itemResults, items) {
  return items.filter((item) => itemResults[item.key] != null).length;
}

export function needsAttention(itemResults, items) {
  return items.filter((item) => itemResults[item.key] === false);
}
