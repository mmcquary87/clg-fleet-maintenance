// Fleet Maintenance System — annual PM safety check checklist definitions.
//
// Two vehicle-type variants transcribed from CLG's paper "PM Safety
// Check" forms (uploaded 2026-09-18). Each item's `status` on the record
// is one of "ok" | "fail" (tractor) or "ok" | "defect_repaired"
// (trailer) | null (unchecked) -- unlike tractorInspectionItems.js, none
// of these carry a `category`/`severity` mapping, because filing an
// annual inspection does not raise work orders (per CLG, 2026-09-18) --
// it's a record only.

export const TRACTOR_WALKAROUND_ITEMS = [
  { key: "gauges_instrument_panel", label: "Gauges & instrument panel" },
  { key: "fire_extinguisher", label: "Fire extinguisher", sublabel: "Mounted & charged" },
  { key: "triangles", label: "Triangles" },
  { key: "horn", label: "Horn", sublabel: "Air and city" },
  { key: "all_lights", label: "All lights" },
  { key: "reflectors_tape", label: "Reflectors / tape", sublabel: "Incl. mud flaps & exterior of tractor cab" },
  { key: "lug_nuts", label: "Lug nuts" },
  { key: "hub_seal", label: "Hub seal" },
  { key: "wheel_rim", label: "Wheel rim", sublabel: "Check for cracks" },
  { key: "wipers_washer_windshield", label: "Wipers, washer & windshield" },
];

export const TRACTOR_UNDER_HOOD_TRUCK_ITEMS = [
  { key: "any_leaks", label: "Check for any leaks" },
  { key: "steering_shaft", label: "Steering shaft" },
  { key: "steering_linkage", label: "Steering linkage" },
  { key: "gear_box", label: "Gear box" },
  { key: "spring_hangers", label: "Spring hangers" },
  { key: "shocks", label: "Shocks" },
  { key: "belts_hoses", label: "Belts & hoses" },
  { key: "exhaust_system", label: "Exhaust system" },
  { key: "u_bolt", label: "U-bolt" },
  { key: "frame_cross_members", label: "Frame cross members" },
  { key: "torque_arm", label: "Torque arm" },
  { key: "u_joint_yokes", label: "U-joint & yokes", sublabel: "Circle which, enter info in notes" },
  { key: "brakes_wheel_seals", label: "Brakes & wheel seals" },
  { key: "carrier_bearing", label: "Carrier bearing" },
  { key: "clutch_adjustment", label: "Clutch adjustment" },
  { key: "hoses_lines", label: "Hoses & lines", sublabel: "Cracked, chaffed, rubbing" },
  { key: "battery_load", label: "Battery load" },
  { key: "alternator_output", label: "Alternator output" },
  { key: "starter_operation", label: "Operation of starter" },
  { key: "air_pressure_buildup", label: "Air pressure build-up time" },
];

export const TRACTOR_FIFTH_WHEEL_ITEMS = [
  { key: "fasteners_locking_pin", label: "All fasteners & locking pin" },
  { key: "fifth_wheel_plate_throat", label: "Fifth wheel plate & throat" },
  { key: "platform_mounting_bolts", label: "Platform & mounting bolts" },
  { key: "center_abs_valve", label: "Center ABS valve", sublabel: "In-cab check" },
];

export const TRACTOR_ALL_CHECK_ITEMS = [
  ...TRACTOR_WALKAROUND_ITEMS,
  ...TRACTOR_UNDER_HOOD_TRUCK_ITEMS,
  ...TRACTOR_FIFTH_WHEEL_ITEMS,
];

// Right side, then left side -- same order as the paper form.
export const TRACTOR_TIRE_POSITIONS = [
  "A-1 R", "A-2 RI", "A-2 RO", "A-3 RI", "A-3 RO",
  "A-1 L", "A-2 LI", "A-2 LO", "A-3 LI", "A-3 LO",
];

export const TRACTOR_BRAKE_POSITIONS = [
  "A-1 R", "A-1 L", "A-2 R", "A-2 L", "A-3 R", "A-3 L",
];

export const PM_SERVICE_LEVELS = [
  { value: "A", label: `"A" PM Service — 12,500 miles` },
  { value: "AF", label: `"AF" PM Service — 25,000 miles` },
  { value: "B", label: `"B" PM Service — 50,000 miles` },
];

// The trailer form checks one broad category at a time (a paragraph of
// inspection criteria, one OK / Defect Repaired toggle) rather than the
// tractor form's one-checkbox-per-part rows -- `sublabel` here is the
// paper form's own criteria text, shown so the mechanic knows what the
// category covers without needing the paper form in hand.
export const TRAILER_BRAKE_SYSTEM_ITEMS = [
  { key: "service_brake", label: "Service brake", sublabel: "No absence of braking action. Inspect brake parts: no cracked, broken, missing, loose, deformed." },
  { key: "no_audible_air_leaks", label: "No audible air leaks" },
  { key: "brake_drums", label: "Brake drums", sublabel: "Inspect for external cracking, missing pieces." },
  { key: "brake_shoes", label: "Brake shoes & friction surface", sublabel: "No cracks, contamination." },
  { key: "hoses_tubing_air_lines", label: "Hoses, tubing, air lines, couplings, fittings, gladhands & seals", sublabel: "No contact with moving parts, no worn/frayed/kinked/blocked/loose lines. Inspect brake valves. Drain air tanks." },
  { key: "grease_scam_bushings", label: "Grease S-cam bushings & slack adjusters", sublabel: "All wheels" },
  { key: "hubs", label: "Hubs", sublabel: "No wheel seal leaks. Fill oil hub caps. Replace leaking oil hub cap." },
];

export const TRAILER_CATEGORY_ITEMS = [
  { key: "suspension", label: "Suspension", sublabel: "No loose, cracked, missing or broken parts: U-bolts, torque arms, saddles, spring hangers, leaves, assemblies, tracking components, axles/axle positioning parts. No air bag damage. Tighten loose parts." },
  { key: "coupling_devices", label: "Coupling devices", sublabel: "Inspect kingpin, upper coupler plate, pintle hook, pintle hook latch, supporting frame member, fasteners. No broken/cracked components, no cracked welds, no excessive wear or chipping of kingpin." },
  { key: "locking_devices", label: "Locking devices", sublabel: "Inspect all twist locks, push pins, handles & safety devices. No cracked welds, no ineffective, excessively worn, bent, broken or missing parts." },
  { key: "slider_assembly", label: "Slider assembly", sublabel: "If equipped. Inspect for missing, broken, damaged, binding, inoperative, worn or cracked parts. No damaged/bent slider stops, no elongated slider apertures, no cracked or improper welds." },
  { key: "frame_body", label: "Frame & body", sublabel: "Main frame rails, bolsters, sub-frames, cross members, gussets, ICC bumper, light boxes, mudflap hangers, header board, floor boards, side rails, side walls, ceiling, rear doors/rollers/hinges. No damage, cracked welds, or broken/missing/loose/sagging parts." },
  { key: "electrical", label: "Electrical", sublabel: "Seven-way connector plug, wiring harness, junction box, lighting devices and reflectors: tail/stop lamps, clearance, side marker lights, turn signals, I.D. lights, tag lamp, reflective tape." },
  { key: "landing_gear", label: "Landing gear & securement devices", sublabel: "Legs, sandshoes, mounting boxes, braces, cross shaft, mounting hardware. Check operation both directions. No cracked welds or broken/missing/loose parts. Check chains/binders/load locks." },
  { key: "wheels_rims", label: "Wheels / rims", sublabel: "Inspect all wheels, rim spacers and fasteners. No bent, broken, improperly seated, sprung, or mismatched parts. No elongated bolt holes, stripped parts, or loose lug nuts." },
  { key: "tires", label: "Tires", sublabel: "Inspect all tires and sidewalls for leaks, proper mating, no separations, missing chunks, or cuts through one or more ply. No tread depth under 2/32 — replace if so." },
];

export const TRAILER_ALL_CHECK_ITEMS = [
  ...TRAILER_BRAKE_SYSTEM_ITEMS,
  ...TRAILER_CATEGORY_ITEMS,
];

// Axle 1 = front (of the trailer's tandem), Axle 2 = rear -- L/R side, F/O
// (inner/outer dual) position, same shorthand as the paper form.
export const TRAILER_TIRE_POSITIONS = [
  "Axle 1 — L/F/I", "Axle 1 — L/F/O", "Axle 1 — R/F/I", "Axle 1 — R/F/O",
  "Axle 2 — L/R/I", "Axle 2 — L/R/O", "Axle 2 — R/R/I", "Axle 2 — R/R/O",
];

export const TRAILER_BRAKE_LINING_POSITIONS = ["L/F", "R/F", "R/R", "L/R"];

export function countChecked(checklist) {
  return checklist.filter((item) => item.status != null).length;
}
