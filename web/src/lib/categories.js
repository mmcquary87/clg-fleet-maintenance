export const CATEGORIES = [
  "PM / Oil", "Tires", "Brakes", "Engine", "Electrical",
  "Transmission", "Trailer / Body", "DOT Inspection", "Tow", "Other",
];

// Built from CLG's own brand hues (royal blue #1155A1, scarlet #EB2127) --
// every color sits on the arc that bridges those two anchors (blue ->
// teal/green/gold -> red), not an unrelated generic rainbow. Validated
// with the dataviz skill's tooling (node scripts/validate_palette.js,
// adjacent-pair mode, surface #E7EDF1): clears the CVD, normal-vision, and
// chroma-floor gates in this category order. A few slots sit under the
// 3:1 contrast guideline against a light surface -- legal here because
// every place these render (Spend charts/legends) also shows the
// category name and dollar value directly, never color alone.
export const CAT_COLORS = {
  "Tires": "#0091C2",
  "PM / Oil": "#A37600",
  "Engine": "#00B1AE",
  "Brakes": "#327B1F",
  "Trailer / Body": "#909D00",
  "Electrical": "#8A4500",
  "Transmission": "#C0745C",
  "Other": "#993247",
  "DOT Inspection": "#35A27B",
  "Tow": "#099AFF",
};
