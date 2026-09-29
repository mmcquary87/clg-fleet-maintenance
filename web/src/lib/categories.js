export const CATEGORIES = [
  "PM / Oil", "Tires", "Brakes", "Suspension", "Transmission", "Electrical", "Batteries",
  "Engine", "Emissions / Aftertreatment", "AC / HVAC", "Body / Structural",
  "DOT Inspection", "Mid-Trip Inspection", "Tow", "Detailing / Cleaning", "General Repair",
  "Additives / Fluids",
];

// scan-invoice is a manually-deployed Edge Function (CLAUDE.md) -- its own
// CATEGORIES enum can silently drift behind this file's after a taxonomy
// change (a rename or a new category) if nobody redeploys it. When that
// happens, Claude picks a category string that no longer exists here, and
// a <select value={that}> with no matching <option> renders as if the
// first option were chosen while its real state stays the stale value --
// invisible until save fails on the DB's own enum check. Coerce scan
// results through this so state always matches what's displayed.
export function sanitizeCategory(category) {
  return CATEGORIES.includes(category) ? category : CATEGORIES[0];
}

// Built from CLG's own brand hues (royal blue #1155A1, scarlet #EB2127) --
// every color sits on the arc that bridges those two anchors (blue ->
// teal/green/gold -> red), not an unrelated generic rainbow. Validated
// with the dataviz skill's tooling (node scripts/validate_palette.js,
// adjacent-pair mode, surface #E7EDF1): clears the CVD, normal-vision, and
// chroma-floor gates in this exact key order below (the original 10 colors
// kept in their originally-validated order/values, with new colors always
// appended at the end so the only new adjacent pair to check is at that
// boundary). A few slots sit under the 3:1 contrast guideline against a
// light surface -- legal here because every place these render (Spend
// charts/legends) also shows the category name and dollar value directly,
// never color alone. Not yet validated for a dark-mode surface -- the app
// has no dark mode today.
export const CAT_COLORS = {
  "Tires": "#0091C2",
  "PM / Oil": "#A37600",
  "Engine": "#00B1AE",
  "Brakes": "#327B1F",
  "Body / Structural": "#909D00",
  "Electrical": "#8A4500",
  "Transmission": "#C0745C",
  "General Repair": "#993247",
  "DOT Inspection": "#35A27B",
  "Tow": "#099AFF",
  "Suspension": "#6B4C9A",
  "Emissions / Aftertreatment": "#B2555C",
  "AC / HVAC": "#2D8FBF",
  "Detailing / Cleaning": "#7A8C3A",
  "Mid-Trip Inspection": "#3D5A99",
  "Batteries": "#C99A00",
  "Additives / Fluids": "#7A4CA0",
};
