import { useMemo, useState } from "react";
import { Loader2, Navigation, Info } from "lucide-react";
import { Alert } from "../../ds";
import { useTracking, ASSUMED_MPH } from "../../hooks/useTracking";
import TrackingTable from "./TrackingTable";
import UnitDrawer from "../shared/UnitDrawer";

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

// ui-improvement-punch-list.md's filter set. Single-select: picking one
// isolates a specific risk/data-quality dimension rather than stacking
// several partial views, since these mostly answer different questions
// ("what's late" vs. "what's a data gap") rather than composing usefully.
const FILTERS = [
  { key: "late", label: "Late risk", test: (r) => r.eta.severity === "attention" },
  { key: "hos", label: "HOS risk", test: (r) => r.eta.resetsNeeded > 0 },
  { key: "noAppt", label: "No appointment", test: (r) => !r.eta.hasAppointment },
  { key: "noGps", label: "No GPS", test: (r) => !r.eta.hasPosition },
  { key: "today", label: "Delivering today", test: (r) => r.eta.projectedArrival && isSameDay(r.eta.projectedArrival, new Date()) },
  { key: "tomorrow", label: "Delivering tomorrow", test: (r) => r.eta.projectedArrival && isSameDay(r.eta.projectedArrival, new Date(Date.now() + 86400000)) },
];

function FilterChips({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(active === f.key ? null : f.key)}
          style={{
            fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: "var(--clg-radius-pill)", cursor: "pointer",
            border: active === f.key ? "1px solid var(--clg-royal)" : "1px solid var(--clg-border-default)",
            background: active === f.key ? "var(--clg-royal)" : "transparent",
            color: active === f.key ? "#fff" : "var(--clg-granite)",
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function TrackingView() {
  const { rows, groups, total, loading, error, reload } = useTracking();
  const [activeFilter, setActiveFilter] = useState(null);
  const [openUnitId, setOpenUnitId] = useState(null);

  const visibleRows = useMemo(() => {
    if (!activeFilter) return rows;
    const filter = FILTERS.find((f) => f.key === activeFilter);
    return filter ? rows.filter(filter.test) : rows;
  }, [rows, activeFilter]);

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)" }}>
      <div style={{
        background: "var(--clg-navy)", color: "#fff", padding: "20px 28px",
        display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--clg-mercury)", display: "flex", alignItems: "center", gap: 6 }}>
            <Navigation size={12} /> Units in transit
          </div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 36, lineHeight: 1 }}>
            {total}
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,.18)" }} />
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--clg-mercury)" }}>Needs attention</div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 36, lineHeight: 1, color: "var(--clg-scarlet)" }}>
            {groups.attention.length}
          </div>
        </div>
        <div
          title={`Position refreshes every 15 minutes from Samsara. Drive time still needed assumes ${ASSUMED_MPH} mph straight-line until Google Maps traffic-aware routing is connected — but the projected arrival factors in any mandatory HOS reset the driver's remaining drive-clock requires.`}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "var(--clg-reflection)", cursor: "help" }}
        >
          <Info size={15} />
          <span style={{ fontSize: 11.5 }}>How this is calculated</span>
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 1280, margin: "0 auto" }}>
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
            <div style={{ marginBottom: 16 }}>
              <FilterChips active={activeFilter} onChange={setActiveFilter} />
            </div>

            {visibleRows.length === 0 ? (
              <div style={{
                border: "1px dashed var(--clg-mercury)", padding: "16px 12px", fontSize: 12,
                color: "var(--clg-pewter)", textAlign: "center", background: "var(--clg-surface-subtle)",
              }}>
                Nothing matches this filter right now.
              </div>
            ) : (
              <TrackingTable rows={visibleRows} onOpenUnit={setOpenUnitId} />
            )}
          </>
        )}

        <button
          onClick={reload}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "16px 0 0", fontSize: 11.5, color: "var(--clg-royal)", textDecoration: "underline" }}
        >
          Refresh now
        </button>
      </div>

      {openUnitId && <UnitDrawer unitId={openUnitId} onClose={() => setOpenUnitId(null)} />}
    </div>
  );
}
