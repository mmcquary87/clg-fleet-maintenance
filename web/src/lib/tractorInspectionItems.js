// Fleet Maintenance System — tractor inspection checklist definitions.
//
// Every item here is a boolean field on tractor_inspections where
// true = good (Yes / OK), false = a problem (No / Needs attention).
// `category`/`severity` are what a work order raised from a false item
// gets stamped with -- a first-pass mapping onto the existing 9-category
// enum (none of these fit perfectly; adjust here if CLG wants different
// categories, this is the one place that mapping lives). `goodLabel`/
// `badLabel` are just which button pair the source design used for that
// row (Yes/No vs OK/Needs attention) -- purely cosmetic, same boolean
// underneath either way.
//
// Walkaround items are marked severity "Urgent" -- they're the physical
// safety walkaround (coupling, brakes, tires, lights), not paperwork.
// Everything else defaults to "Routine".

export const EQUIPMENT_ITEMS = [
  { key: "prepass_transponder", label: "Prepass transponder", sublabel: "Record the transponder number", category: "Other", hasNumber: "prepass_transponder_number", numberLabel: "Prepass transponder #" },
  { key: "current_ifta_decal", label: "Current IFTA decal", sublabel: "Both doors", category: "Other" },
  { key: "loves_rfid", label: "Love's RFID in windshield", sublabel: "Record the number", category: "Other", hasNumber: "loves_rfid_number", numberLabel: "Love's RFID #" },
  { key: "eld_dashcam_cables", label: "ELD, dash cam and both cables", category: "Electrical" },
  { key: "warning_triangles", label: "Three warning triangles", sublabel: "Side box", category: "Other" },
  { key: "kingpin_lock_key", label: "King pin lock and key", category: "Other" },
  { key: "circle_lock_key", label: "Circle lock and key", category: "Other" },
  { key: "cell_tablet_mount", label: "Mount for cell / tablet", sublabel: "Photo required", category: "Other", hasPhoto: true },
  { key: "inverter", label: "Inverter", sublabel: "Works and clean", category: "Electrical" },
  { key: "refrigerator", label: "Refrigerator", sublabel: "Works and clean", category: "Electrical" },
  { key: "apu", label: "APU", sublabel: "If applicable — works", category: "Engine" },
  { key: "kill_switch", label: "Kill switch", sublabel: "List the location", category: "Electrical", hasNumber: "kill_switch_location", numberLabel: "Kill switch location" },
];

export const WALKAROUND_ITEMS = [
  { key: "fifth_wheel_plate", label: "Fifth wheel plate", sublabel: "Greased, not loose, not cracked, no missing bolts", category: "Trailer / Body", severity: "Urgent", goodLabel: "OK", badLabel: "Needs attention" },
  { key: "airlines", label: "Airlines", sublabel: "Secure, no cracks, not chafed", category: "Brakes", severity: "Urgent", goodLabel: "OK", badLabel: "Needs attention" },
  { key: "tires_lugs_hubs", label: "Tires, lugs and hubs", sublabel: "Tread, no chunks / cuts / wires, air pressure, lugs tight, hub oil not leaking, mudflaps whole and tight", category: "Tires", severity: "Urgent", goodLabel: "OK", badLabel: "Needs attention" },
  { key: "all_lights_work", label: "All lights work", category: "Electrical", severity: "Urgent" },
  { key: "reflective_ls", label: "Inverted reflective L's on back of cab", category: "Other", severity: "Urgent" },
];

export const DOCUMENT_ITEMS = [
  { key: "registration_doc", label: "Registration", category: "DOT Inspection" },
  { key: "insurance_doc", label: "Insurance", category: "DOT Inspection" },
  { key: "annual_inspection_doc", label: "Annual inspection", category: "DOT Inspection" },
  { key: "ifta_license_doc", label: "IFTA license", category: "DOT Inspection" },
  { key: "blank_logs_doc", label: "Blank logs", category: "DOT Inspection" },
  { key: "eld_driver_guide_doc", label: "ELD driver guide", category: "DOT Inspection" },
  { key: "eld_dot_card_doc", label: "ELD DOT card", category: "DOT Inspection" },
  { key: "eld_malfunction_instructions_doc", label: "ELD malfunction instructions", category: "DOT Inspection" },
  { key: "lease_agreement_doc", label: "Lease agreement", sublabel: "If applicable", category: "DOT Inspection" },
];

// All boolean checklist items across every section, flattened -- what
// filing an inspection scans to decide which work orders to raise.
export const ALL_CHECK_ITEMS = [...EQUIPMENT_ITEMS, ...WALKAROUND_ITEMS, ...DOCUMENT_ITEMS];

export function countChecked(inspection) {
  return ALL_CHECK_ITEMS.filter((item) => inspection[item.key] != null).length;
}

export function countNeedsAttention(inspection) {
  return ALL_CHECK_ITEMS.filter((item) => inspection[item.key] === false);
}
