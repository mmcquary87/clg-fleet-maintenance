import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Eyebrow, Table } from "../../ds";
import { useMissingDvirs } from "../../hooks/useMissingDvirs";

function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}

const COLUMNS = [
  { key: "tripStartCell", label: "Shift start" },
  { key: "driverCell", label: "Driver" },
  { key: "unitCell", label: "Unit" },
  { key: "tripEndCell", label: "First drive ended" },
  { key: "detectedCell", label: "Detected" },
];

export default function MissingDvirs() {
  const { rows, totals, loading, error } = useMissingDvirs();
  const [driverQuery, setDriverQuery] = useState("");

  const filtered = rows.filter((r) => {
    if (!driverQuery.trim()) return true;
    const name = (r.driver?.name ?? "").toLowerCase();
    return name.includes(driverQuery.trim().toLowerCase());
  });

  const tableRows = filtered.map((r) => ({
    ...r,
    tripStartCell: fmtDateTime(r.trip_start_time),
    driverCell: r.driver?.name ?? "Unmatched driver",
    unitCell: r.unit ? `${r.unit.number} (${r.unit.type})` : r.samsara_vehicle_id,
    tripEndCell: fmtDateTime(r.trip_end_time),
    detectedCell: fmtDateTime(r.detected_at),
  }));

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading missing DVIRs…
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Eyebrow>
          {totals.total} missing pre-trip{totals.total === 1 ? "" : "s"} · last 30 days · {totals.driverCount} {totals.driverCount === 1 ? "driver" : "drivers"}
        </Eyebrow>
        <input
          value={driverQuery}
          onChange={(e) => setDriverQuery(e.target.value)}
          placeholder="Filter by driver name"
          style={{
            border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
            padding: "6px 10px", fontSize: 12.5, fontFamily: "var(--clg-font-body)",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
        A driver starting a shift (first drive after 10+ hours of rest) with no pre-trip DVIR submitted on the same
        vehicle within 4 hours before to 1 hour after. Each row counts 0.25 points against that driver's HOS score
        (the "Missing DVIR" infraction) until a late DVIR is submitted covering it, at which point it drops off this
        list automatically.
        {totals.unlinkedDriverCount > 0 && (
          <> {totals.unlinkedDriverCount} {totals.unlinkedDriverCount === 1 ? "row isn't" : "rows aren't"} linked to a
          driver record in this app, so {totals.unlinkedDriverCount === 1 ? "it" : "they"} won't affect a score.</>
        )}
      </div>

      <Table columns={COLUMNS} rows={tableRows} />
      {filtered.length === 0 && !error && (
        <div style={{ padding: "24px 0", color: "var(--clg-text-muted)", fontSize: 13, textAlign: "center" }}>
          No missing DVIRs match this filter.
        </div>
      )}
    </div>
  );
}
