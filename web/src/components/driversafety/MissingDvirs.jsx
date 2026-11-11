import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Eyebrow, Table } from "../../ds";
import { useMissingDvirs } from "../../hooks/useMissingDvirs";
import { useAccountabilityInfractions } from "../../hooks/useAccountabilityInfractions";
import { downloadCsv } from "../../lib/exportCsv";

function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—";
}

const EVENT_COLUMNS = [
  { key: "tripStartCell", label: "Shift start" },
  { key: "driverCell", label: "Driver" },
  { key: "unitCell", label: "Unit" },
  { key: "tripEndCell", label: "First drive ended" },
  { key: "detectedCell", label: "Detected" },
];

// "YYYY-MM-DD" -> "Sep 13" (parsed as a local date so it can't slip a day).
function fmtRangeDate(s) {
  return new Date(`${s}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function describeRange(range) {
  if (!range) return "last 90 days";
  if (range.start && range.end) return `${fmtRangeDate(range.start)} – ${fmtRangeDate(range.end)}`;
  if (range.start) return `since ${fmtRangeDate(range.start)}`;
  if (range.end) return `through ${fmtRangeDate(range.end)}`;
  return "last 90 days";
}

// A shift whose Samsara vehicle isn't linked to a CLGOS unit: show a short,
// recognisable tail of the id instead of the full 15-digit number.
function unitLabel(r) {
  if (r.unit) return `${r.unit.number} (${r.unit.type})`;
  return r.samsara_vehicle_id ? `Unlinked vehicle …${String(r.samsara_vehicle_id).slice(-6)}` : "—";
}

function toggleStyle(active) {
  return {
    border: "none", cursor: "pointer", padding: "6px 12px", fontSize: 12.5, fontWeight: 600,
    borderRadius: "var(--clg-radius-sm)", fontFamily: "var(--clg-font-body)",
    background: active ? "var(--clg-surface-card)" : "transparent",
    boxShadow: active ? "var(--clg-shadow-resting)" : "none",
    color: "var(--clg-text-heading)",
  };
}

// range: the Driver Safety page's own date control ({start,end} | null), so
// this tab follows the same period as the scorecard above it.
export default function MissingDvirs({ range = null }) {
  const { rows, totals, detectionStart, windowStartDate, loading, error } = useMissingDvirs(range);
  const { infractions } = useAccountabilityInfractions();
  const [driverQuery, setDriverQuery] = useState("");
  const [view, setView] = useState("driver");

  // Points per missing DVIR come from the Missing DVIR infraction row (same
  // source the scorecard view reads), not a copy of the number here.
  const pointsEach = infractions.find((i) => i.name === "Missing DVIR")?.points ?? null;

  const filtered = useMemo(() => {
    const q = driverQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.driver?.name ?? "").toLowerCase().includes(q));
  }, [rows, driverQuery]);

  const byDriver = useMemo(() => {
    const groups = new Map();
    for (const r of filtered) {
      const key = r.driver_id ?? "unmatched";
      const g = groups.get(key) ?? { key, name: r.driver?.name ?? "Unmatched driver", linked: !!r.driver_id, count: 0, last: null };
      g.count += 1;
      if (!g.last || r.trip_start_time > g.last) g.last = r.trip_start_time;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [filtered]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading missing DVIRs…
      </div>
    );
  }

  const eventRows = filtered.map((r) => ({
    ...r,
    tripStartCell: fmtDateTime(r.trip_start_time),
    driverCell: r.driver?.name ?? "Unmatched driver",
    unitCell: unitLabel(r),
    tripEndCell: fmtDateTime(r.trip_end_time),
    detectedCell: fmtDateTime(r.detected_at),
  }));

  const driverColumns = [
    { key: "nameCell", label: "Driver" },
    { key: "countCell", label: "Missing DVIRs", align: "right" },
    ...(pointsEach != null ? [{ key: "pointsCell", label: "HOS points", align: "right" }] : []),
    { key: "lastCell", label: "Most recent shift" },
  ];
  const driverRows = byDriver.map((g) => ({
    ...g,
    nameCell: g.name,
    countCell: g.count,
    pointsCell: g.linked ? (g.count * pointsEach).toFixed(2) : "not scored",
    lastCell: fmtDateTime(g.last),
  }));

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (view === "driver") {
      downloadCsv(`missing-dvirs-by-driver-${stamp}.csv`, byDriver, [
        { label: "Driver", value: (g) => g.name },
        { label: "Missing DVIRs", value: (g) => g.count },
        ...(pointsEach != null ? [{ label: "HOS points", value: (g) => (g.linked ? g.count * pointsEach : "") }] : []),
        { label: "Most recent shift", value: (g) => g.last ?? "" },
      ]);
    } else {
      downloadCsv(`missing-dvirs-${stamp}.csv`, filtered, [
        { label: "Shift start", value: (r) => r.trip_start_time ?? "" },
        { label: "Driver", value: (r) => r.driver?.name ?? "Unmatched driver" },
        { label: "Unit", value: (r) => (r.unit ? `${r.unit.number} (${r.unit.type})` : "") },
        { label: "Samsara vehicle id", value: (r) => r.samsara_vehicle_id ?? "" },
        { label: "First drive ended", value: (r) => r.trip_end_time ?? "" },
        { label: "Detected", value: (r) => r.detected_at ?? "" },
      ]);
    }
  };

  // The range (or the default 90 days) can reach back before detection
  // existed; say so rather than letting an empty early period read as "clean".
  const reachesBeforeDetection = detectionStart && windowStartDate && windowStartDate < detectionStart.slice(0, 10);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Eyebrow>
          {totals.total} missing pre-trip{totals.total === 1 ? "" : "s"} · {describeRange(range)} · {totals.driverCount} {totals.driverCount === 1 ? "driver" : "drivers"}
        </Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "var(--clg-smoke)", borderRadius: "var(--clg-radius-md)", padding: 3, gap: 2 }}>
            <button style={toggleStyle(view === "driver")} onClick={() => setView("driver")}>By driver</button>
            <button style={toggleStyle(view === "events")} onClick={() => setView("events")}>All events</button>
          </div>
          <input
            value={driverQuery}
            onChange={(e) => setDriverQuery(e.target.value)}
            placeholder="Filter by driver name"
            style={{
              border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
              padding: "6px 10px", fontSize: 12.5, fontFamily: "var(--clg-font-body)",
            }}
          />
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--clg-border-default)",
              borderRadius: "var(--clg-radius-sm)", padding: "6px 10px", fontSize: 12.5, fontWeight: 600,
              background: "transparent", cursor: filtered.length === 0 ? "default" : "pointer",
              opacity: filtered.length === 0 ? 0.5 : 1, color: "var(--clg-text-heading)",
            }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
        A driver starting a shift (first drive after 10+ hours of rest) with no pre-trip DVIR submitted on the same
        vehicle within 4 hours before to 1 hour after.
        {pointsEach != null && <> Each row counts {pointsEach} points against that driver's HOS score (the "Missing DVIR" infraction)</>}
        {pointsEach != null ? " until" : " Until"} a late DVIR is submitted covering it, at which point it drops off this
        list automatically.
        {totals.unlinkedDriverCount > 0 && (
          <> {totals.unlinkedDriverCount} {totals.unlinkedDriverCount === 1 ? "row isn't" : "rows aren't"} linked to a
          driver record in this app, so {totals.unlinkedDriverCount === 1 ? "it" : "they"} won't affect a score.</>
        )}
      </div>

      {reachesBeforeDetection && (
        <div style={{ fontSize: 12, color: "var(--clg-text-body)", background: "var(--clg-surface-subtle)", padding: "8px 12px", borderRadius: "var(--clg-radius-sm)", marginBottom: 10 }}>
          Automatic detection started recently — nothing earlier than {fmtDate(detectionStart)} can appear here, so a
          period reaching further back is only partly covered.
        </div>
      )}

      {view === "driver"
        ? <Table columns={driverColumns} rows={driverRows} />
        : <Table columns={EVENT_COLUMNS} rows={eventRows} />}
      {filtered.length === 0 && !error && (
        <div style={{ padding: "24px 0", color: "var(--clg-text-muted)", fontSize: 13, textAlign: "center" }}>
          {rows.length === 0 ? "No missing DVIRs in this period." : "No missing DVIRs match this filter."}
        </div>
      )}
    </div>
  );
}
