import { useEffect, useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import { Badge, Input } from "../../ds";
import { useUnitDetail } from "../../hooks/useUnitDetail";
import { MILESTONES, nextDueDate, dueStatus } from "../../lib/maintenanceSchedule";
import UnitInfoCard from "../intake/UnitInfoCard";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function statusTone(status) {
  if (status === "overdue") return "critical";
  if (status === "due_soon") return "accent";
  if (status === "ok") return "brand";
  return "neutral";
}

function statusLabel(status) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "ok") return "On track";
  return "Not set";
}

function MilestoneRow({ milestone, unit, onSave, saving }) {
  const interval = milestone.fixedInterval ?? unit[milestone.intervalField];
  const [lastDate, setLastDate] = useState(unit[milestone.lastField] || "");
  const [intervalDays, setIntervalDays] = useState(milestone.intervalField ? (unit[milestone.intervalField] ?? "") : "");

  useEffect(() => {
    setLastDate(unit[milestone.lastField] || "");
    setIntervalDays(milestone.intervalField ? (unit[milestone.intervalField] ?? "") : "");
  }, [unit, milestone]);

  const next = nextDueDate(unit[milestone.lastField], interval);
  const status = dueStatus(next);

  const dirty = lastDate !== (unit[milestone.lastField] || "")
    || (milestone.intervalField && String(intervalDays) !== String(unit[milestone.intervalField] ?? ""));

  const save = () => {
    const fields = { [milestone.lastField]: lastDate || null };
    if (milestone.intervalField) fields[milestone.intervalField] = intervalDays === "" ? null : Number(intervalDays);
    onSave(fields);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 140px 120px 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-text-heading)" }}>
        {milestone.label}
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Last done</div>
        <Input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
      </div>
      <div>
        {milestone.intervalField ? (
          <>
            <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Interval (days)</div>
            <Input type="number" min="1" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} placeholder="e.g. 90" />
          </>
        ) : (
          <>
            <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Interval (fixed)</div>
            <div style={{ fontSize: 13, color: "var(--clg-text-body)", padding: "11px 0" }}>{milestone.fixedInterval} days</div>
          </>
        )}
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Next due</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-body)" }}>{next || "—"}</span>
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
        </div>
      </div>
      <button
        type="button" onClick={save} disabled={!dirty || saving}
        title="Save"
        style={{
          background: "none", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
          cursor: dirty ? "pointer" : "not-allowed", opacity: dirty ? 1 : 0.35, padding: "8px 10px",
          display: "inline-flex", alignItems: "center", color: "var(--clg-royal)",
        }}
      >
        {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
      </button>
    </div>
  );
}

export default function UnitDetailModal({ unitId, onClose }) {
  const { unit, orders, loading, error, updateSchedule } = useUnitDetail(unitId);
  const [saving, setSaving] = useState(false);

  const handleSave = async (fields) => {
    setSaving(true);
    await updateSchedule(fields);
    setSaving(false);
  };

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
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 1040,
          boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--clg-text-muted)" }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : error || !unit ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--clg-scarlet)", fontSize: 13 }}>{error || "Unit not found."}</div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.08em" }}>
                  {unit.type?.toUpperCase()}
                </div>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 20, color: "var(--clg-navy)", marginTop: 2 }}>
                  Unit {unit.number}
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>

            <div style={{ padding: 24, display: "flex", gap: 28 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  Maintenance schedule
                </div>
                <div>
                  {MILESTONES.map((m) => (
                    <MilestoneRow key={m.key} milestone={m} unit={unit} onSave={handleSave} saving={saving} />
                  ))}
                </div>

                <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", margin: "24px 0 8px" }}>
                  Work order history ({orders.length})
                </div>
                {orders.length === 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
                    No work orders logged for this unit yet.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                      <thead>
                        <tr>
                          {["Category", "Issue", "Vendor", "Status", "Closed", "Cost"].map((h) => (
                            <th key={h} style={{
                              textAlign: h === "Cost" ? "right" : "left", padding: "8px 10px", fontFamily: "var(--clg-font-heading)",
                              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                              color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o, i) => (
                          <tr key={o.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                            <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                              {o.category}
                              {o.is_chargeback && <Badge tone="critical" style={{ marginLeft: 6 }}>Chargeback</Badge>}
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--clg-text-muted)", maxWidth: 220, borderBottom: "1px solid var(--clg-border-subtle)" }}>
                              {o.complaint || o.description || "—"}
                            </td>
                            <td style={{ padding: "8px 10px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                              {o.vendor?.name || "—"}
                            </td>
                            <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{o.status}</td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                              {o.date_closed || "—"}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                              {money(o.cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ width: 320, flexShrink: 0 }}>
                <UnitInfoCard unit={unit} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
