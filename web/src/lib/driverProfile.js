// Standardized driver-lead fields (supabase/migrations/20260928000000) --
// dropdowns/toggles only, kept short enough to be reportable. Anything
// that doesn't fit one of these belongs in the lead's call/interaction
// log (LogInteractionForm) instead of a new column here.

export const HOME_TIME_OPTIONS = [
  { value: "home_daily", label: "Home daily" },
  { value: "home_weekly", label: "Home weekly" },
  { value: "home_every_2_weeks", label: "Home every 2 weeks" },
  { value: "otr_flexible", label: "OTR / flexible" },
];

export const RUN_PREFERENCE_OPTIONS = [
  { value: "otr", label: "OTR (over the road)" },
  { value: "regional", label: "Regional" },
  { value: "dedicated_local", label: "Dedicated / local" },
];

export const EXPERIENCE_OPTIONS = [
  { value: "lt_1", label: "Less than 1 year" },
  { value: "yrs_1_2", label: "1-2 years" },
  { value: "yrs_3_5", label: "3-5 years" },
  { value: "yrs_6_10", label: "6-10 years" },
  { value: "yrs_10_plus", label: "10+ years" },
];

export const EQUIPMENT_OPTIONS = [
  { value: "dry_van", label: "Dry van" },
  { value: "reefer", label: "Reefer" },
  { value: "flatbed", label: "Flatbed" },
  { value: "tanker", label: "Tanker" },
  { value: "other", label: "Other" },
];

export const ENDORSEMENT_OPTIONS = [
  { value: "hazmat", label: "Hazmat" },
  { value: "tanker", label: "Tanker" },
  { value: "doubles_triples", label: "Doubles/triples" },
  { value: "passenger", label: "Passenger" },
  { value: "school_bus", label: "School bus" },
];

function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || value;
}

export function homeTimeLabel(v) { return v ? labelFor(HOME_TIME_OPTIONS, v) : null; }
export function runPreferenceLabel(v) { return v ? labelFor(RUN_PREFERENCE_OPTIONS, v) : null; }
export function experienceLabel(v) { return v ? labelFor(EXPERIENCE_OPTIONS, v) : null; }
export function equipmentLabels(values) { return (values || []).map((v) => labelFor(EQUIPMENT_OPTIONS, v)); }
export function endorsementLabels(values) { return (values || []).map((v) => labelFor(ENDORSEMENT_OPTIONS, v)); }
