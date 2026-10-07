import { Loader2 } from "lucide-react";
import { StatBlock, StatusPill, Table } from "../../ds";
import { useDriverSafety } from "../../hooks/useDriverSafety";

function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

function scoreCell(value) {
  return value === null || value === undefined ? "—" : round1(value);
}

function milesCell(value) {
  return Math.round(value).toLocaleString();
}

function perMileCell(value) {
  return value === null || value === undefined ? "—" : round1(value);
}

// overall_score is null either because the driver hasn't moved in the
// scoring window (miles_driven <= 0) or because they're still inside the
// 14-day new-driver grace period baked into the scorecard view -- the view
// doesn't expose which, so this is inferred from miles_driven rather than
// needing a migration just to label two blank-score reasons.
function blankReason(row) {
  return row.miles_driven > 0 ? "New driver (grace period)" : "No driving data";
}

function overallCell(row) {
  if (row.overall_score === null) {
    return <span style={{ color: "var(--clg-text-muted)", fontSize: 12.5 }}>{blankReason(row)}</span>;
  }
  return (
    <StatusPill tone={row.score_band || "neutral"}>
      {round1(row.overall_score)}
    </StatusPill>
  );
}

function pointsVsAverageCell(row) {
  if (row.points_vs_average === null || row.points_vs_average === undefined) return "—";
  const v = round1(row.points_vs_average);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}`;
}

const COLUMNS = [
  { key: "driver_name", label: "Driver" },
  { key: "overall", label: "Overall", align: "right" },
  { key: "points_vs_average", label: "vs fleet avg", align: "right" },
  { key: "speeding_score", label: "Speeding", align: "right" },
  { key: "safety_score", label: "Safety", align: "right" },
  { key: "hos_score", label: "HOS", align: "right" },
  { key: "miles_driven", label: "Miles", align: "right" },
  { key: "safety_events_per_1k_miles", label: "Safety evts / 1k mi", align: "right" },
  { key: "speeding_events_per_1k_miles", label: "Speeding evts / 1k mi", align: "right" },
];

export default function DriverSafetyView() {
  const { scorecards, totals, loading, error } = useDriverSafety();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "60px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading the scorecard…
      </div>
    );
  }

  const rows = scorecards.map((row) => ({
    ...row,
    driver_name: row.driver_name,
    overall: overallCell(row),
    points_vs_average: pointsVsAverageCell(row),
    speeding_score: scoreCell(row.speeding_score),
    safety_score: scoreCell(row.safety_score),
    hos_score: scoreCell(row.hos_score),
    miles_driven: milesCell(row.miles_driven),
    safety_events_per_1k_miles: perMileCell(row.safety_events_per_1k_miles),
    speeding_events_per_1k_miles: perMileCell(row.speeding_events_per_1k_miles),
  }));

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)" }}>
      <div style={{
        background: "var(--clg-navy)", color: "#fff", padding: "26px 28px",
        display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap",
      }}>
        <StatBlock
          tone="inverse"
          value={totals.fleetAverage !== null ? round1(totals.fleetAverage) : "—"}
          label="Fleet average"
          note={`${totals.scoredCount} of ${totals.driverCount} drivers scored`}
        />
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,.18)" }} />
        <div style={{ display: "flex", gap: 20 }}>
          <StatusPill tone="green">{totals.greenCount} above average</StatusPill>
          <StatusPill tone="yellow">{totals.yellowCount} near average</StatusPill>
          <StatusPill tone="red">{totals.redCount} below average</StatusPill>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13 }}>{error}</div>
      )}

      <div style={{ padding: "24px 28px" }}>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
          Trailing 90-day window, scored against Samsara safety events, HOS violations, and speeding
          intervals. A driver's score stays blank until they've logged miles in the window or cleared
          Samsara's 14-day new-driver grace period.
        </div>
        <Table columns={COLUMNS} rows={rows} />
      </div>

      {!loading && scorecards.length === 0 && !error && (
        <div style={{ padding: "0 28px 28px", color: "var(--clg-text-muted)", fontSize: 13 }}>
          No drivers linked to Samsara yet.
        </div>
      )}
    </div>
  );
}
