import { useState } from "react";
import { Alert } from "../../ds";
import { useCoverageIssues } from "../../hooks/useCoverageIssues";

// Shown at the top of the Driver Scorecard whenever the Samsara data feeding
// the scores has a known hole, so a driver's score is never silently built on
// incomplete data (a truck not linked to Samsara looks the same as a clean
// truck, which is how a +21 mph event went missing on 2026-11-12). Renders
// nothing when the check finds nothing.
const KIND_LABEL = {
  sync_stalled: "Sync stalled",
  unlinked_truck: "Truck not linked to Samsara",
  unattributed_speeding: "Speeding with no driver",
  no_speeding_data: "Driver with no speeding data",
};

export default function CoverageIssuesBanner() {
  const { issues, loading, error } = useCoverageIssues();
  const [expanded, setExpanded] = useState(false);

  if (loading) return null;

  if (error) {
    return (
      <Alert tone="critical" title="Couldn't run the data coverage check" style={{ marginTop: 16 }}>
        Scores may be built on incomplete data and nothing is checking it right now. {error}
      </Alert>
    );
  }

  if (issues.length === 0) return null;

  const hasCritical = issues.some((i) => i.severity === "critical");
  const shown = expanded ? issues : issues.slice(0, 3);

  return (
    <Alert
      tone="critical"
      title={`${issues.length} data coverage ${issues.length === 1 ? "issue" : "issues"} — some scores may be missing events`}
      style={{ marginTop: 16 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {shown.map((i) => (
          <div key={`${i.kind}:${i.subject}`}>
            <strong>{KIND_LABEL[i.kind] ?? i.kind}</strong>
            {i.subject ? ` — ${i.subject}` : ""}: {i.detail}
          </div>
        ))}
      </div>
      {issues.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-link)", fontSize: 12, fontWeight: 600, padding: 0, marginTop: 8 }}
        >
          {expanded ? "Show fewer" : `Show all ${issues.length}`}
        </button>
      )}
      {hasCritical && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          The data sync itself is behind, so every score on this page may be out of date.
        </div>
      )}
    </Alert>
  );
}
