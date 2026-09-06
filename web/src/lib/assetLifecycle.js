// Asset_Lifecycle_Disposal_Spec.md — pure calc functions for the buy/sell
// (disposal or replacement) decision signal. No Supabase calls here; see
// hooks/useAssetLifecycle.js for the data fetch this runs on.
//
// A few of the spec's own items are explicitly undecided ([OPEN] in the
// spec) and must not be built as settled logic (spec §1, §9):
//   - the single-invoice dollar threshold (§5 item 2) — null until CLG
//     supplies a starting figure, in which case that trigger simply never
//     fires (see reliabilityMatches below), not a guessed number standing
//     in for one.
//   - the cumulative $/mile trend threshold (§5 item 3) and an aggregate
//     self-built market trendline (§4.4) — both need a historical time
//     series (mileage-over-time, comp-price-over-time) this app doesn't
//     capture anywhere yet, so neither is implemented at all here. The
//     "spend trending upward even after warranty repairs" half of the
//     Release — Risk escalation rule (§5.2) rides on that same undecided
//     trend concept, so this only implements the other, well-defined half
//     of that rule: a second matched reliability event.

const MS_PER_YEAR = 365.25 * 86400000;

// Spec §4.3's refresh-cadence bands (quarterly under ~80% of target,
// monthly in the ~80-110% "decision window", quarterly again past 110%)
// expressed as ratios of the configured target rather than the spec's own
// worked example numbers (200k/275k against a 250k target) — so this
// still tracks correctly if CLG changes the target band (spec §2: "a
// configurable input, not a fixed rule").
const DECISION_WINDOW_START_RATIO = 0.8;
const DECISION_WINDOW_END_RATIO = 1.1;

export function ageYears(unit) {
  if (unit?.in_service_date) {
    return { years: (Date.now() - new Date(unit.in_service_date).getTime()) / MS_PER_YEAR, isApproximate: false };
  }
  if (unit?.year) {
    return { years: new Date().getFullYear() - unit.year, isApproximate: true };
  }
  return { years: null, isApproximate: false };
}

// Simple least-squares regression of price against mileage across a
// unit's own comp set (spec §4.2) — self-corrects with each refresh, no
// separate $/mile assumption to maintain over time.
function regress(points) {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  const varX = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  if (varX === 0) return { slope: 0, intercept: meanY }; // all comps at the same mileage — flat estimate
  const covXY = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const slope = covXY / varX;
  return { slope, intercept: meanY - slope * meanX };
}

export function estimateMarketValue(comps, unitMileage) {
  if (!comps || comps.length === 0) {
    return { estimatedValue: null, mileageAdjustmentPerMile: null, sampleSize: 0, asOfDate: null, insufficient: true };
  }
  const points = comps.map((c) => ({ x: c.comp_mileage, y: Number(c.comp_asking_price) }));
  const { slope, intercept } = regress(points);
  const atMileage = unitMileage != null ? unitMileage : points.reduce((s, p) => s + p.x, 0) / points.length;
  const estimatedValue = Math.max(0, intercept + slope * atMileage);
  const asOfDate = comps.reduce((latest, c) => (!latest || c.pulled_at > latest ? c.pulled_at : latest), null);
  return {
    estimatedValue,
    mileageAdjustmentPerMile: slope,
    sampleSize: comps.length,
    asOfDate,
    insufficient: comps.length < 2, // one comp is a data point, not a regression — flag it as thin evidence rather than pretend confidence
  };
}

export function refreshCadenceFor(odometer, unitAgeYears, config) {
  const milesRatio = odometer != null ? odometer / config.asset_target_miles : 0;
  const ageRatio = unitAgeYears != null ? unitAgeYears / config.asset_target_age_years : 0;
  const ratio = Math.max(milesRatio, ageRatio);
  if (ratio >= DECISION_WINDOW_START_RATIO && ratio < DECISION_WINDOW_END_RATIO) return "monthly";
  return "quarterly";
}

export function isCompsStale(asOfDate, cadence) {
  if (!asOfDate) return true;
  const days = (Date.now() - new Date(asOfDate).getTime()) / 86400000;
  const cadenceDays = cadence === "monthly" ? 31 : 92;
  return days > cadenceDays;
}

// Spec §5: any ONE of the trigger conditions below trips the reliability
// flag (OR logic) — repair category match, or a single invoice over the
// configured dollar threshold. The system records which trigger fired per
// event for drill-down, never a black-box flag (spec §5, intro).
export function reliabilityMatches(workOrders, config) {
  const categories = new Set(config.asset_reliability_categories || []);
  const threshold = config.asset_single_invoice_threshold;
  return (workOrders || [])
    .map((wo) => {
      const triggers = [];
      if (categories.has(wo.category)) triggers.push("category_match");
      if (threshold != null && Number(wo.cost) >= threshold) triggers.push("single_invoice");
      return triggers.length > 0 ? { ...wo, triggers } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date_opened) - new Date(a.date_opened));
}

const STATE_LABELS = {
  hold: "Hold",
  monitor: "Monitor",
  release_window: "Release — Window",
  release_risk: "Release — Risk",
};

// Spec §3's four-state recommendation, plus §5.2's "trigger opens an
// Investigation, doesn't auto-dispose" rule: a single reliability event is
// treated as noise (Monitor), a second escalates to Release — Risk
// independent of mileage/age position.
export function recommend({ unit, workOrders, comps, config }) {
  const { years, isApproximate } = ageYears(unit);
  const pastTarget = (unit.odometer != null && unit.odometer >= config.asset_target_miles)
    || (years != null && years >= config.asset_target_age_years);
  const approachingTarget = !pastTarget && (
    (unit.odometer != null && unit.odometer >= config.asset_target_miles * DECISION_WINDOW_START_RATIO)
    || (years != null && years >= config.asset_target_age_years * DECISION_WINDOW_START_RATIO)
  );

  const reliabilityEvents = reliabilityMatches(workOrders, config);
  const reliabilityCount = reliabilityEvents.length;

  const value = estimateMarketValue(comps, unit.odometer);
  const cumulativeSpend = (workOrders || [])
    .filter((wo) => wo.status === "Closed" && !wo.voided)
    .reduce((s, wo) => s + (Number(wo.cost) || 0), 0);
  const netPosition = value.estimatedValue != null ? value.estimatedValue - cumulativeSpend : null;

  let state;
  let driverText;
  if (reliabilityCount >= 2) {
    state = "release_risk";
    driverText = `${reliabilityCount} reliability-flagged repairs on file — a pattern, not a one-off.`;
  } else if (reliabilityCount === 1) {
    state = "monitor";
    driverText = "One reliability-flagged repair under review — treated as noise until a pattern is established.";
  } else if (pastTarget) {
    if (value.insufficient) {
      state = "monitor";
      driverText = "In/near the target exit window, but not enough comps on file yet to confirm market value.";
    } else if (netPosition != null && netPosition > 0) {
      state = "release_window";
      driverText = "In the target exit window, market value still favorable against cumulative spend, no reliability flags.";
    } else {
      state = "monitor";
      driverText = "Past the target exit window, but cumulative spend has caught up to estimated market value.";
    }
  } else if (approachingTarget) {
    state = "monitor";
    driverText = "Approaching the target exit window.";
  } else {
    state = "hold";
    driverText = "Below the target exit window, spend normal, no reliability flags.";
  }

  const cadence = refreshCadenceFor(unit.odometer, years, config);

  return {
    state,
    stateLabel: STATE_LABELS[state],
    driverText,
    ageYears: years,
    ageIsApproximate: isApproximate,
    pastTarget,
    approachingTarget,
    marketValue: value,
    cumulativeSpend,
    netPosition,
    reliability: { count: reliabilityCount, events: reliabilityEvents },
    refreshCadence: cadence,
    compsStale: isCompsStale(value.asOfDate, cadence),
  };
}
