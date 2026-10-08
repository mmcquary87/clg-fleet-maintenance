import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Eyebrow, StatusPill, Table } from "../../ds";
import { useDvirDefects } from "../../hooks/useDvirDefects";

const STATUS_FILTERS = ["all", "open", "resolved"];
const STATUS_LABEL = { all: "All", open: "Open", resolved: "Resolved" };

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none", cursor: "pointer", borderRadius: "var(--clg-radius-pill)",
        padding: "6px 14px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        background: active ? "var(--clg-navy)" : "var(--clg-surface-subtle)",
        color: active ? "#fff" : "var(--clg-text-body)",
      }}
    >
      {children}
    </button>
  );
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

const COLUMNS = [
  { key: "created_at", label: "Reported" },
  { key: "unitCell", label: "Unit" },
  { key: "defect_type", label: "Defect" },
  { key: "comment", label: "Comment" },
  { key: "statusCell", label: "Status" },
  { key: "resolvedByCell", label: "Resolved by" },
];

export default function Dvir() {
  const { defects, totals, loading, error } = useDvirDefects();
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverQuery, setDriverQuery] = useState("");

  const filtered = defects.filter((d) => {
    if (statusFilter === "open" && d.is_resolved) return false;
    if (statusFilter === "resolved" && !d.is_resolved) return false;
    if (driverQuery.trim()) {
      const name = (d.driver?.name ?? d.resolved_by_name ?? "").toLowerCase();
      if (!name.includes(driverQuery.trim().toLowerCase())) return false;
    }
    return true;
  });

  const rows = filtered.map((d) => ({
    ...d,
    created_at: fmtDate(d.created_at),
    unitCell: d.unit ? `${d.unit.number} (${d.unit.type})` : "—",
    comment: d.comment || "—",
    statusCell: <StatusPill tone={d.is_resolved ? "green" : "yellow"}>{d.is_resolved ? "Resolved" : "Open"}</StatusPill>,
    resolvedByCell: d.driver?.name
      ? d.driver.name
      : d.resolved_by_name
        ? `${d.resolved_by_name} (${d.resolved_by_type ?? "unknown"})`
        : "—",
  }));

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading DVIR defects…
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Eyebrow>
          {totals.total} defect{totals.total === 1 ? "" : "s"} · last 30 days · {totals.open} open
        </Eyebrow>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={driverQuery}
            onChange={(e) => setDriverQuery(e.target.value)}
            placeholder="Filter by driver name"
            style={{
              border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
              padding: "6px 10px", fontSize: 12.5, fontFamily: "var(--clg-font-body)",
            }}
          />
          {STATUS_FILTERS.map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{STATUS_LABEL[s]}</Chip>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
        Informational only — DVIR defects never affect a driver's score. "Resolved by" is whoever closed the defect
        out in Samsara, not necessarily who reported it; {totals.linkedToDriver} of {totals.total} are linked to a
        driver record in this app.
      </div>

      <Table columns={COLUMNS} rows={rows} />
      {filtered.length === 0 && !error && (
        <div style={{ padding: "24px 0", color: "var(--clg-text-muted)", fontSize: 13, textAlign: "center" }}>
          No defects match this filter.
        </div>
      )}
    </div>
  );
}
