import { X, Loader2 } from "lucide-react";
import { Alert } from "../../ds";
import { useDriverPointBreakdown } from "../../hooks/useDriverPointBreakdown";

function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

function Section({ title, subtitle, rows, emptyNote, footnote }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13, color: "var(--clg-navy)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2, marginBottom: 8 }}>{subtitle}</div>}
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", padding: "6px 0" }}>{emptyNote}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: subtitle ? 0 : 8 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: "1px solid var(--clg-border-subtle)" }}>
                <td style={{ padding: "6px 4px", color: "var(--clg-text-body)" }}>{r.label}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--clg-text-muted)", whiteSpace: "nowrap" }}>{r.count} × {r.weight}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700, color: "var(--clg-scarlet, #B3243A)", whiteSpace: "nowrap" }}>
                  −{round1(r.points)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {footnote && <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 6 }}>{footnote}</div>}
    </div>
  );
}

// row: one record from driver_safety_scorecard (driver_id, driver_name,
// speeding_score, safety_score, hos_score, overall_score, ...)
// range: whatever window the Rankings tab's date-range tool currently has
// selected (null = official trailing 90 days), so the breakdown matches
// the score it's explaining.
export default function DriverPointBreakdown({ row, range = null, onClose }) {
  const { data, loading, error } = useDriverPointBreakdown(row.driver_id, range);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, .5)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 560,
          boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)" }}>
              {row.driver_name}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
              Overall {row.overall_score != null ? round1(row.overall_score) : "—"} · {range ? `${range.start ?? "earliest"} to ${range.end ?? "today"}` : "trailing 90 days"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "16px 24px 24px" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "30px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
              <Loader2 size={16} className="spin" /> Loading breakdown…
            </div>
          )}
          {error && <Alert tone="critical" title="Couldn't load breakdown">{error}</Alert>}
          {data && (
            <>
              <Section
                title={`Speeding — score ${round1(row.speeding_score)}`}
                subtitle="Intervals at or under 85mph, by severity (100 × e^(−points/700))"
                rows={data.speeding.bySeverity}
                emptyNote="No scored speeding intervals in the window."
                footnote={data.speeding.excludedOver85 > 0 ? `${data.speeding.excludedOver85} interval(s) over 85mph excluded from scoring.` : null}
              />
              <Section
                title={`Safety — score ${round1(row.safety_score)}`}
                subtitle="Weighted behavior labels (100 − points × 5)"
                rows={data.safety.rows}
                emptyNote="No scored safety events in the window."
                footnote={[
                  data.safety.dismissedCount > 0 ? `${data.safety.dismissedCount} dismissed event(s) excluded.` : null,
                  data.safety.otherCount > 0 ? `${data.safety.otherCount} unweighted label(s) not shown.` : null,
                ].filter(Boolean).join(" ") || null}
              />
              <Section
                title={`HOS — score ${round1(row.hos_score)}`}
                subtitle="Weighted violation types (100 − points × 4)"
                rows={data.hos.rows}
                emptyNote="No scored HOS violations in the window."
                footnote={data.hos.otherCount > 0
                  ? `${data.hos.otherCount} administrative/paperwork flag(s) (e.g. missing certification, shipping ID, or trailer name) excluded -- these are logbook/documentation gaps, not real hours-of-service clock violations, and never affect this score.`
                  : null}
              />
              <div style={{ fontSize: 11, color: "var(--clg-text-muted)", borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 10 }}>
                Overall = 100 × (average of the three / 100)^1.7, capped at 100.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
