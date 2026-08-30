// CLG Operations Dashboard KPI governance — mirrors the "CLG Operations
// Dashboard Framework v1.0" document (Fidelis Strategic Consulting).
// 17 primary weekly KPIs across three modules, plus 2 supporting controls
// and 1 daily exception measure. Formulas, thresholds, and source systems
// are copied verbatim from that framework; do not invent numbers here that
// aren't in the source doc. A KPI's `threshold.status` is "active" only
// when the framework itself marks it "Defined and Active" — everything
// else is "pending" per the framework's own governance rules, regardless
// of whether we have real data for it.

// Targets CLG approved 2026-08-30 (mmcquary@clgdelivers.com), activating
// three previously-Pending KPIs. Tolerance bands (10% below/above for $ and
// mi-style targets, 5% for MPG) match the "Up to X% below/above target"
// language the framework doc already used for these KPIs while they were
// still Pending — only the target number itself was missing before.
export const APPROVED_TARGETS = {
  3: { target: 17.0, toleranceMode: "relative", tolerancePct: 10, direction: "lowerIsBetter" },
  6: { target: 4850, toleranceMode: "relative", tolerancePct: 10, direction: "higherIsBetter" },
  8: { target: 6.5, toleranceMode: "relative", tolerancePct: 5, direction: "higherIsBetter" },
};

// KPI 12 is judged per fleet segment, not as one blended fleet-wide number
// — CLG's explicit call (2026-08-30): a local truck's shorter weekly miles
// shouldn't drag down or prop up an OTR truck's number, and vice versa.
// Keyed by Alvys's driver.Fleet.Name, lowercased. Segments not listed here
// (e.g. "local", "flatbed", "Unassigned") have no approved target yet and
// stay ungoverned in the breakdown.
export const FLEET_MILE_TARGETS = {
  "long haul": { target: 2500, tolerancePct: 10 },
  "otr": { target: 2500, tolerancePct: 10 },
  "super regional": { target: 2000, tolerancePct: 10 },
  "regional": { target: 2000, tolerancePct: 10 },
};

export const MODULES = [
  { id: "planning", name: "Network Planning & Order Management", tagline: "Build the plan." },
  { id: "fleet", name: "Fleet Utilization", tagline: "Protect and optimize the released plan." },
  { id: "driver", name: "Driver Management & Execution", tagline: "Execute safely and reliably." },
];

// dataStatus: "live" (we compute this from a connected source) | "blocked" (no source connected yet)
// blockedReason is shown when dataStatus === "blocked"
export const KPIS = [
  {
    no: 1, module: "planning", name: "Planning Horizon Compliance", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Available drivers with complete 5-day operating plans ÷ available drivers requiring work × 100",
    threshold: { status: "pending", green: "≥95.0%", yellow: "85.0–94.9%", red: "<85.0%" },
    dataStatus: "blocked", blockedReason: "Needs a 5-day planning coverage board and a governed driver-availability roster — neither exists yet.",
  },
  {
    no: 2, module: "planning", name: "72-Hour Load Assignment Stability", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Eligible assignments unchanged from the 72-hour checkpoint through final release ÷ eligible assignments at the 72-hour checkpoint × 100",
    threshold: { status: "pending", green: "≥90.0%", yellow: "80.0–89.9%", red: "<80.0%" },
    dataStatus: "blocked", blockedReason: "Needs governed 72-hour assignment snapshots from Alvys — not pulled yet.",
  },
  {
    no: 3, module: "planning", name: "Planned Empty Mile Percentage", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Planned empty miles ÷ total planned miles × 100",
    threshold: { status: "active", green: "≤17.0%", yellow: "17.1–18.7% (up to 10% above target)", red: ">18.7%" },
    dataStatus: "live", unit: "%",
  },
  {
    no: 4, module: "planning", name: "Planned Driver Capacity Utilization", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Planned productive driving capacity assigned to revenue work ÷ realistically available productive driving capacity × 100",
    threshold: { status: "pending", green: "≥90.0%", yellow: "80.0–89.9%", red: "<80.0%" },
    dataStatus: "blocked", blockedReason: "Needs a governed driver-availability roster plus Alvys planning data — neither exists yet.",
  },
  {
    no: 5, module: "planning", name: "Order Data Accuracy", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Orders released without a material correction ÷ total accepted orders released × 100",
    threshold: { status: "pending", green: "≥98.0%", yellow: "95.0–97.9%", red: "<95.0%" },
    dataStatus: "blocked", blockedReason: "Needs Alvys order field-change history — not pulled yet.",
  },
  {
    no: "SC-01", module: "planning", name: "Order Feasibility Review Completion", classification: "Supporting Control", type: "Leading",
    formula: "Accepted orders with a documented feasibility review ÷ total accepted orders × 100",
    threshold: { status: "pending", green: "100% after activation", yellow: "95.0–99.9% after activation", red: "<95.0% after activation" },
    dataStatus: "blocked", blockedReason: "This is a manual review workflow CLG hasn't stood up yet — not a data-integration gap.",
  },
  {
    no: 6, module: "fleet", name: "Revenue per Active Tractor per Week", classification: "Primary Weekly KPI — Departmental Variant", type: "Lagging",
    formula: "Total weekly operating revenue ÷ average active tractors",
    threshold: { status: "active", green: "≥$4,850", yellow: "$4,365–$4,849 (up to 10% below)", red: "<$4,365" },
    dataStatus: "live", unit: "$",
  },
  {
    no: 7, module: "fleet", name: "Empty Mile Percentage", classification: "Primary Weekly KPI — Exact Inherited Executive KPI", type: "Lagging",
    formula: "Empty miles ÷ total miles × 100",
    threshold: { status: "active", green: "<10.0%", yellow: "10.0–14.9%", red: "≥15.0%" },
    dataStatus: "live", unit: "%",
  },
  {
    no: 8, module: "fleet", name: "Fleet Miles per Gallon", classification: "Primary Weekly KPI", type: "Lagging",
    formula: "Total governed fleet miles ÷ total governed gallons",
    threshold: { status: "active", green: "≥6.5 MPG", yellow: "6.18–6.49 MPG (up to 5% below)", red: "<6.18 MPG" },
    dataStatus: "live", unit: "MPG",
  },
  {
    no: 9, module: "fleet", name: "On-Time Pickup", classification: "Primary Weekly KPI — Exact Inherited Executive KPI", type: "Lagging",
    formula: "On-time pickups ÷ total eligible pickups × 100",
    threshold: { status: "pending", green: "≥90.0% (target 95.0%)", yellow: "80.0–89.9% (target 90.0–94.9%)", red: "<80.0% (target <90.0%)" },
    dataStatus: "live", unit: "%",
  },
  {
    no: 10, module: "fleet", name: "Operating Plan Adherence", classification: "Primary Weekly KPI", type: "Lagging",
    formula: "Eligible completed loads executed per the final approved plan ÷ eligible completed loads × 100",
    threshold: { status: "pending", green: "≥90.0% (target 95.0%)", yellow: "80.0–89.9%", red: "<80.0%" },
    dataStatus: "blocked", blockedReason: "Needs a governed final-plan snapshot from Alvys — not pulled yet.",
  },
  {
    no: "DE-01", module: "fleet", name: "Projected Late Load Exposure", classification: "Daily Exception Measure", type: "Leading",
    formula: "Active loads whose latest projected arrival falls outside the appointment window",
    threshold: { status: "pending", green: "Not applicable — daily exception view", yellow: "Not applicable", red: "Priority by exception-severity rules" },
    dataStatus: "live", unit: "loads",
  },
  {
    no: 11, module: "driver", name: "Driver Utilization", classification: "Primary Weekly KPI", type: "Lagging",
    formula: "Available driver-days meeting the approved minimum productive-use standard ÷ total available driver-days × 100",
    threshold: { status: "pending", green: "≥90.0% after activation", yellow: "80.0–89.9% after activation", red: "<80.0% after activation" },
    dataStatus: "blocked", blockedReason: "Needs a governed driver-availability roster — doesn't exist yet.",
  },
  {
    no: 12, module: "driver", name: "Revenue Miles per Active Driver per Week", classification: "Primary Weekly KPI", type: "Lagging",
    formula: "Total revenue-producing miles ÷ average active drivers",
    threshold: {
      status: "active",
      green: "At/above the applicable fleet-segment target (OTR/Long haul ≥2,500 mi; Regional/Super Regional ≥2,000 mi)",
      yellow: "Up to 10% below that segment's target",
      red: ">10% below that segment's target",
    },
    // The headline figure above stays an unjudged fleet-wide blend (no
    // single number is meaningful across segments) — see the "BY FLEET"
    // breakdown for the actual per-segment Green/Yellow/Red reads.
    dataStatus: "live", unit: "mi",
  },
  {
    no: 13, module: "driver", name: "Average Daily Drive-Hour Utilization Percentage", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Productive driving hours ÷ realistically available productive driving capacity × 100",
    threshold: { status: "pending", green: "≥85.0%", yellow: "75.0–84.9%", red: "<75.0%" },
    dataStatus: "blocked", blockedReason: "Samsara HOS data is reachable, but the “realistically available capacity” denominator requires a CLG-approved methodology that doesn't exist yet.",
  },
  {
    no: 14, module: "driver", name: "Released HOS-Infeasible Plan Percentage", classification: "Primary Weekly KPI", type: "Leading",
    formula: "Released assignments with unresolved HOS infeasibility ÷ released assignments requiring HOS validation × 100",
    threshold: { status: "pending", green: "0.0%", yellow: "Not used — any value above 0.0% is Red", red: ">0.0% (Priority 1)" },
    dataStatus: "blocked", blockedReason: "Needs Alvys release-plan history cross-referenced with Samsara HOS — not built yet.",
  },
  {
    no: 15, module: "driver", name: "On-Time Delivery", classification: "Primary Weekly KPI — Exact Inherited Executive KPI", type: "Lagging",
    formula: "On-time deliveries ÷ total eligible deliveries × 100",
    threshold: { status: "pending", green: "≥90.0% (target 95.0%)", yellow: "80.0–89.9%", red: "<80.0%" },
    dataStatus: "live", unit: "%",
  },
  {
    no: 16, module: "driver", name: "Driver Waiting and Detention Hours", classification: "Primary Weekly KPI", type: "Lagging",
    formula: "Governed waiting hours + governed detention hours ÷ average active drivers",
    threshold: { status: "pending", green: "At/below approved target", yellow: "Up to 10.0% above target", red: ">10.0% above target" },
    dataStatus: "live", unit: "hrs",
  },
  {
    no: 17, module: "driver", name: "Driver Schedule Adherence", classification: "Primary Weekly KPI", type: "Lagging",
    formula: "Approved home-time events and planned days off honored ÷ total approved home-time events and planned days off × 100",
    threshold: { status: "pending", green: "≥95.0% after activation", yellow: "90.0–94.9% after activation", red: "<90.0% after activation" },
    // Covers recurring home-time schedules (planned_home_time) checked
    // against real Alvys trip activity -- not yet the "planned days off"
    // half of the formula (driver_roster's Vacation/Personal Leave
    // exceptions have no per-occurrence honored/violated tracking), and
    // approval status isn't filtered on (the field is free text, not an
    // enforced state). Partial, not the full governed formula yet.
    dataStatus: "live", unit: "%",
  },
  {
    no: "SC-02", module: "driver", name: "Detention Identification and Submission Timeliness", classification: "Supporting Control", type: "Leading",
    formula: "Potential detention events completed within the approved timeframe ÷ total potential detention events × 100",
    threshold: { status: "pending", green: "100% after activation", yellow: "95.0–99.9% after activation", red: "<95.0% after activation" },
    dataStatus: "blocked", blockedReason: "This is a manual review workflow CLG hasn't stood up yet — not a data-integration gap.",
  },
];
