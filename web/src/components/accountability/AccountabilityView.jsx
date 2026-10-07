import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Eyebrow, StatBlock, StatusPill, Table } from "../../ds";
import { useDriverIncidents } from "../../hooks/useDriverIncidents";
import LogIncidentForm from "./LogIncidentForm";

const SEVERITY_TONE = { Minor: "neutral", Moderate: "yellow", Heavy: "red", Severe: "red" };
const FINE_TONE = { Yes: "red", No: "neutral", Review: "yellow" };
const SEVERITY_ORDER = ["Minor", "Moderate", "Heavy", "Severe"];

function fmtDate(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString() : "—";
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
];

export default function AccountabilityView({ session }) {
  const { incidents, totals, loading, error, reload } = useDriverIncidents();
  const [showForm, setShowForm] = useState(false);

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

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginTop: 16 }}>{error}</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 20 }}>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <StatBlock align="left" value={totals.fineEligibleCount} label="Fine eligible" note="across logged incidents" />
        </div>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <StatBlock align="left" value={totals.reviewCount} label="Needs review" note="score or fleet average missing" />
        </div>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <StatBlock align="left" value={totals.pendingAppealsCount} label="Pending appeals" />
        </div>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <Eyebrow style={{ marginBottom: 8 }}>By severity</Eyebrow>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SEVERITY_ORDER.map((s) => (
              <StatusPill key={s} tone={SEVERITY_TONE[s]}>{s} {totals.severityCounts[s]}</StatusPill>
            ))}
          </div>
        </div>
      </div>

      {totals.topDrivers.length > 0 && (
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16, marginTop: 14 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Most records</Eyebrow>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {totals.topDrivers.map((d) => (
              <div key={d.driver_name} style={{ fontSize: 13 }}>
                <strong>{d.driver_name}</strong> <span style={{ color: "var(--clg-text-muted)" }}>· {d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
