// Client-side mirror of the Samsara-to-infraction pattern matching that
// accountability_infraction_patterns drives server-side (see
// 20261029000000_accountability_single_source_of_truth.sql's
// driver_safety_scorecard rewrite). Built from the already-fetched
// accountability_infractions rows (each embedding its
// accountability_infraction_patterns via a nested select) instead of
// hardcoding a second copy of the weight tables here -- previously
// duplicated independently in useDriverPointBreakdown.js and
// useIncidentMapEvents.js, already drifted from the SQL and from each
// other before this file existed.
//
// infractions: rows from accountability_infractions, each with an embedded
// `accountability_infraction_patterns` array (fetch via
// `.select("*, accountability_infraction_patterns(match_type, match_value)")`).

function prefixTest(pattern) {
  // Patterns are ILIKE 'foo%' prefixes (matching the SQL side exactly) --
  // never a full regex, so a literal-prefix test is all that's needed.
  const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
  const lowerPrefix = prefix.toLowerCase();
  return (value) => (value ?? "").toLowerCase().startsWith(lowerPrefix);
}

function buildRules(infractions, matchType) {
  const rules = [];
  for (const inf of infractions) {
    if (!inf.counts_toward_score) continue;
    for (const p of inf.accountability_infraction_patterns ?? []) {
      if (p.match_type !== matchType) continue;
      rules.push({
        test: matchType === "speeding_severity" ? (v) => v === p.match_value : prefixTest(p.match_value),
        label: inf.name,
        weight: inf.points,
      });
    }
  }
  return rules;
}

function matchAgainst(rules, value) {
  for (const rule of rules) {
    if (rule.test(value)) return { label: rule.label, weight: rule.weight };
  }
  return null;
}

// Returns three lookup functions built once from `infractions`, each
// (value) => { label, weight } | null.
export function buildScoringIndex(infractions) {
  const safetyLabelRules = buildRules(infractions, "safety_label");
  const hosDescriptionRules = buildRules(infractions, "hos_description");
  const speedingSeverityRules = buildRules(infractions, "speeding_severity");
  return {
    matchSafetyLabel: (name) => matchAgainst(safetyLabelRules, name),
    matchHosDescription: (description) => matchAgainst(hosDescriptionRules, description),
    matchSpeedingSeverity: (severityLevel) => matchAgainst(speedingSeverityRules, severityLevel),
  };
}
