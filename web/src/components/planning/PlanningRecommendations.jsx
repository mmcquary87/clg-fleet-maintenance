import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Eyebrow, StatusPill, Table, Button } from "../../ds";
import { usePlanningRecommendations } from "../../hooks/usePlanningRecommendations";

const STATUS_FILTERS = ["open", "accepted", "dismissed", "all"];
const STATUS_LABEL = { open: "Open", accepted: "Accepted", dismissed: "Dismissed", all: "All" };
const PRIORITY_TONE = { urgent: "red", high: "yellow", normal: "neutral", low: "neutral" };

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

function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}

function agentLabel(role) {
  return (role || "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const COLUMNS = [
  { key: "createdCell", label: "Raised" },
  { key: "agentCell", label: "Agent" },
  { key: "title", label: "Recommendation" },
  { key: "relatedCell", label: "Related to" },
  { key: "priorityCell", label: "Priority" },
  { key: "statusCell", label: "Status" },
  { key: "actionsCell", label: "" },
];

export default function PlanningRecommendations() {
  const { rows, totals, loading, error, accept, dismiss } = usePlanningRecommendations();
  const [statusFilter, setStatusFilter] = useState("open");
  const [busyId, setBusyId] = useState(null);

  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);

  const handle = async (id, action) => {
    setBusyId(id);
    await action(id);
    setBusyId(null);
  };

  const tableRows = filtered.map((r) => ({
    ...r,
    createdCell: fmtDateTime(r.created_at),
    agentCell: <StatusPill tone="neutral">{agentLabel(r.agent_role)}</StatusPill>,
    relatedCell: r.unit
      ? `${r.unit.number} (${r.unit.type})`
      : r.driver
        ? r.driver.name
        : r.related_load_number || "—",
    priorityCell: <StatusPill tone={PRIORITY_TONE[r.priority] ?? "grey"}>{r.priority}</StatusPill>,
    statusCell: (
      <StatusPill tone={r.status === "accepted" ? "green" : r.status === "dismissed" ? "neutral" : "pending"}>
        {STATUS_LABEL[r.status] ?? r.status}
      </StatusPill>
    ),
    actionsCell: r.status === "open" ? (
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" onClick={() => handle(r.id, accept)} disabled={busyId === r.id} iconLeft={busyId === r.id ? <Loader2 size={13} className="spin" /> : null}>
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => handle(r.id, dismiss)} disabled={busyId === r.id}>
          Dismiss
        </Button>
      </div>
    ) : (
      <span style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{fmtDateTime(r.reviewed_at)}</span>
    ),
  }));

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading recommendations…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", padding: "24px 28px" }}>
      <Eyebrow>Freight planning</Eyebrow>
      <h2 style={{ fontSize: 24, marginTop: 4 }}>
        {totals.open} open recommendation{totals.open === 1 ? "" : "s"}{totals.urgent > 0 ? ` · ${totals.urgent} urgent` : ""}
      </h2>
      <div style={{ fontSize: 13, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 680 }}>
        Proposals from an externally-run freight-planning agent team — load/route suggestions, equipment and HOS
        compliance flags, rate and network guidance. The agents only ever write here; nothing they propose reaches
        Alvys, dispatch, or a driver until a human accepts it below.
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 12px", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{STATUS_LABEL[s]}</Chip>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 20 }}>
        <Table columns={COLUMNS} rows={tableRows} />
        {filtered.length === 0 && !error && (
          <div style={{ padding: "24px 0", color: "var(--clg-text-muted)", fontSize: 13, textAlign: "center" }}>
            {statusFilter === "open" ? "No open recommendations right now." : "Nothing matches this filter."}
          </div>
        )}
      </div>
    </div>
  );
}
