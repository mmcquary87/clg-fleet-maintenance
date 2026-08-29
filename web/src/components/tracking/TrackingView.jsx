import { Loader2, Navigation } from "lucide-react";
import { Alert } from "../../ds";
import { useTracking, ASSUMED_MPH } from "../../hooks/useTracking";
import TrackingCard from "./TrackingCard";

const SECTION_META = {
  attention: {
    title: "Needs attention", accent: true,
    empty: "Nothing here — no active load is at risk of missing its window or running short on HOS.",
  },
  onTrack: {
    title: "On track", accent: false,
    empty: "Nothing currently on pace with complete data.",
  },
  noData: {
    title: "Missing data", accent: false,
    empty: "Every active load has a full position/destination/HOS read.",
  },
};

function Section({ sectionKey, rows }) {
  const meta = SECTION_META[sectionKey];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
        borderTop: `3px solid ${meta.accent ? "var(--clg-scarlet)" : "var(--clg-smoke)"}`, paddingTop: 10,
      }}>
        <span style={{
          fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em",
          textTransform: "uppercase", color: meta.accent ? "var(--clg-ruby)" : "var(--clg-navy)",
        }}>
          {meta.title}
        </span>
        <span style={{ fontSize: 12, color: "var(--clg-cool)" }}>· {rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{
          border: "1px dashed var(--clg-mercury)", padding: "16px 12px", fontSize: 12,
          color: "var(--clg-pewter)", textAlign: "center", background: "var(--clg-surface-subtle)",
        }}>
          {meta.empty}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {rows.map((row) => <TrackingCard key={row.unit.id} row={row} />)}
        </div>
      )}
    </div>
  );
}

export default function TrackingView() {
  const { groups, total, loading, error, reload } = useTracking();

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)" }}>
      <div style={{
        background: "var(--clg-navy)", color: "#fff", padding: "26px 28px",
        display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--clg-mercury)", display: "flex", alignItems: "center", gap: 6 }}>
            <Navigation size={12} /> Units in transit
          </div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 40, lineHeight: 1 }}>
            {total}
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,.18)" }} />
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--clg-mercury)" }}>Needs attention</div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 40, lineHeight: 1, color: "var(--clg-scarlet)" }}>
            {groups.attention.length}
          </div>
        </div>
        <div style={{ marginLeft: "auto", maxWidth: 420, fontSize: 12.5, color: "var(--clg-reflection)" }}>
          Position refreshes every 15 minutes from Samsara. ETA assumes {ASSUMED_MPH} mph over the
          straight-line distance remaining — a floor, not a promise, until Google Maps traffic-aware
          routing is connected.
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
        {error && <Alert tone="critical" title="Couldn't load tracking data" style={{ marginBottom: 16 }}>{error}</Alert>}

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading tracking data…
          </div>
        ) : total === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            No units currently have an active trip on file.
          </div>
        ) : (
          <>
            <Section sectionKey="attention" rows={groups.attention} />
            <Section sectionKey="onTrack" rows={groups.onTrack} />
            <Section sectionKey="noData" rows={groups.noData} />
          </>
        )}

        <button
          onClick={reload}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11.5, color: "var(--clg-royal)", textDecoration: "underline" }}
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
