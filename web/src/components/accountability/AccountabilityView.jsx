import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button, Eyebrow, StatBlock, StatusPill, Table } from "../../ds";
import { useDriverIncidents } from "../../hooks/useDriverIncidents";
import { useDriverNames } from "../../hooks/useDriverNames";
import LogIncidentForm from "./LogIncidentForm";

const SEVERITY_TONE = { Minor: "neutral", Moderate: "yellow", Heavy: "red", Severe: "red" };
const FINE_TONE = { Yes: "red", No: "neutral", Review: "yellow" };
const SEVERITY_ORDER = ["Minor", "Moderate", "Heavy", "Severe"];
const PANEL_STYLE = { background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 };

function fmtDate(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString() : "—";
}

// Horizontal bar list -- same visual language as Driver Safety's "Where the
// points go" panel, reused here for both the coaching-stage and
// violation-family breakdowns instead of two near-identical components.
function BreakdownBars({ title, items }) {
  const total = items.reduce((sum, i) => sum + i.count, 0);
  return (
    <div style={PANEL_STYLE}>
      <Eyebrow style={{ marginBottom: 12 }}>{title}</Eyebrow>
      {items.every((i) => i.count === 0) ? (
        <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No incidents logged yet.</div>
      ) : (
        items.map((i) => (
          <div key={i.label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span>{i.label}</span>
              <span style={{ fontWeight: 700, color: "var(--clg-text-heading)" }}>{i.count}</span>
            </div>
            <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--clg-surface-subtle)" }}>
              <div style={{ width: `${total > 0 ? (i.count / total) * 100 : 0}%`, height: "100%", borderRadius: 4, background: "var(--clg-navy)" }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Same bar-chart shape as Driver Safety's fleet trend chart, scaled to the
// month with the most incidents instead of a fixed 0-100 score axis.
function MonthlyTrendChart({ monthly }) {
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <div style={PANEL_STYLE}>
      <Eyebrow style={{ marginBottom: 12 }}>Monthly incidents · trailing 12 months</Eyebrow>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
        {monthly.map((m, i) => (
          <div key={m.key} title={`${m.label} — ${m.count}`} style={{ flex: "1 0 10px", display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--clg-text-heading)", marginBottom: 2, visibility: m.count > 0 ? "visible" : "hidden" }}>
              {m.count}
            </div>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", height: `${(m.count / max) * 100}%`, minHeight: 2, borderRadius: "3px 3px 0 0",
                background: i === monthly.length - 1 ? "var(--clg-navy)" : "var(--clg-mercury)",
              }} />
            </div>
            <div style={{ fontSize: 9.5, color: "var(--clg-text-muted)", marginTop: 4 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopDriversTable({ drivers }) {
  return (
    <div style={PANEL_STYLE}>
      <Eyebrow style={{ marginBottom: 8 }}>Most records</Eyebrow>
      {drivers.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No incidents logged yet.</div>
      ) : (
        <Table
          columns={[
            { key: "rank", label: "Rank", align: "right" },
            { key: "driver_name", label: "Driver" },
            { key: "count", label: "Records", align: "right" },
          ]}
          rows={drivers}
        />
      )}
    </div>
  );
}

const COLUMNS = [
  { key: "event_date", label: "Date" },
  { key: "driver_name", label: "Driver" },
  { key: "infraction_name", label: "Infraction" },
  { key: "severityCell", label: "Severity" },
  { key: "coaching_stage", label: "Stage" },
  { key: "fineCell", label: "Fine eligible" },
  { key: "appeal_status", label: "Appeal" },
  { key: "issued_by", label: "Issued by" },
  { key: "actionsCell", label: "", align: "right" },
];

export default function AccountabilityView({ session }) {
  const { incidents, totals, loading, error, reload, deleteIncident } = useDriverIncidents();
  const { options: activeDrivers } = useDriverNames({ activeOnly: true });
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const onDelete = async (incident) => {
    if (!window.confirm(`Delete this ${incident.infraction_name} record for ${incident.driver_name}? This can't be undone.`)) return;
    setDeletingId(incident.id);
    setDeleteError(null);
    try {
      await deleteIncident(incident.id);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "60px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading accountability records…
      </div>
    );
  }

  const rows = incidents.map((i) => ({
    ...i,
    event_date: fmtDate(i.event_date),
    severityCell: <StatusPill tone={SEVERITY_TONE[i.severity] || "neutral"}>{i.severity}</StatusPill>,
    fineCell: <StatusPill tone={FINE_TONE[i.fine_eligibility] || "neutral"}>{i.fine_eligibility}</StatusPill>,
    actionsCell: (
      <button
        onClick={() => onDelete(i)}
        disabled={deletingId === i.id}
        title="Delete incident"
        style={{ background: "none", border: "none", cursor: deletingId === i.id ? "default" : "pointer", color: "var(--clg-ruby)", padding: 4 }}
      >
        {deletingId === i.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
      </button>
    ),
  }));

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow>Driver accountability</Eyebrow>
          <h2 style={{ fontSize: 24, marginTop: 4 }}>
            {totals.totalIncidents} logged incident{totals.totalIncidents === 1 ? "" : "s"}
          </h2>
        </div>
        {!showForm && <Button onClick={() => setShowForm(true)}>Log incident</Button>}
      </div>

      {(error || deleteError) && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginTop: 16 }}>{error || deleteError}</div>
      )}

      {showForm && (
        <div style={{ marginTop: 20 }}>
          <LogIncidentForm
            session={session}
            onCancel={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); reload(); }}
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginTop: 20 }}>
        <div style={PANEL_STYLE}>
          <StatBlock align="left" value={activeDrivers.length} label="Total drivers" />
        </div>
        <div style={PANEL_STYLE}>
          <StatBlock align="left" value={totals.totalIncidents} label="Coaching records" />
        </div>
        <div style={PANEL_STYLE}>
          <StatBlock align="left" value={totals.fineEligibleCount} label="Fine eligible" note="across logged incidents" />
        </div>
        <div style={PANEL_STYLE}>
          <StatBlock align="left" value={totals.finalWarningCount} label="Final warnings" />
        </div>
        <div style={{ ...PANEL_STYLE, borderTop: totals.terminationCount > 0 ? "3px solid var(--clg-scarlet)" : undefined }}>
          <StatBlock align="left" value={totals.terminationCount} label="Terminations" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 14 }}>
        <div style={PANEL_STYLE}>
          <StatBlock align="left" value={totals.reviewCount} label="Needs review" note="score or fleet average missing" />
        </div>
        <div style={PANEL_STYLE}>
          <StatBlock align="left" value={totals.pendingAppealsCount} label="Pending appeals" />
        </div>
        <div style={PANEL_STYLE}>
          <Eyebrow style={{ marginBottom: 8 }}>By severity</Eyebrow>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SEVERITY_ORDER.map((s) => (
              <StatusPill key={s} tone={SEVERITY_TONE[s]}>{s} {totals.severityCounts[s]}</StatusPill>
            ))}
          </div>
        </div>
      </div>

      <Eyebrow style={{ marginTop: 24, display: "block" }}>Fleet summary</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 10 }}>
        <BreakdownBars
          title="By coaching stage"
          items={Object.entries(totals.coachingStageCounts).map(([label, count]) => ({ label, count }))}
        />
        <BreakdownBars title="By violation family" items={totals.violationFamilyCounts} />
      </div>
      <div style={{ marginTop: 14 }}>
        <MonthlyTrendChart monthly={totals.monthlyTrend} />
      </div>
      <div style={{ marginTop: 14 }}>
        <TopDriversTable drivers={totals.topDrivers} />
      </div>

      <div style={{ marginTop: 20 }}>
        <Table columns={COLUMNS} rows={rows} />
        {incidents.length === 0 && (
          <div style={{ padding: "24px 0", color: "var(--clg-text-muted)", fontSize: 13, textAlign: "center" }}>
            No incidents logged yet.
          </div>
        )}
      </div>
    </div>
  );
}
