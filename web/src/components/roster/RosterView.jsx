import { useState } from "react";
import { Plus, Loader2, History, ListChecks } from "lucide-react";
import { Card, Badge, Button, Eyebrow, Alert, Input } from "../../ds";
import { useRoster } from "../../hooks/useRoster";
import { useProfile } from "../../hooks/useProfile";
import { rosterStatus, statusTone, daysRemaining } from "../../lib/rosterStatus";
import RosterFormModal from "./RosterFormModal";

function GovernanceBar({ settings, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState(settings?.file_owner || "");
  const [version, setVersion] = useState(settings?.version || "");
  const [reconciled, setReconciled] = useState(settings?.last_reconciled_date || "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setOwner(settings?.file_owner || "");
    setVersion(settings?.version || "");
    setReconciled(settings?.last_reconciled_date || "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    await onSave({ file_owner: owner.trim() || null, version: version.trim() || "1.0", last_reconciled_date: reconciled || null });
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <Card style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>File owner</div>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Named owner" />
        </div>
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Version</div>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
        </div>
        <div style={{ width: 170 }}>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Last reconciliation</div>
          <Input type="date" value={reconciled} onChange={(e) => setReconciled(e.target.value)} />
        </div>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 size={13} className="spin" /> : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 16, display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 10, color: "var(--clg-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>File owner</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)" }}>{settings?.file_owner || "Not set"}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--clg-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Version</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)" }}>{settings?.version || "—"}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--clg-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Last weekly reconciliation</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)" }}>{settings?.last_reconciled_date || "Not set"}</div>
      </div>
      {canEdit && <Button size="sm" variant="outline" onClick={startEdit} style={{ marginLeft: "auto" }}>Edit</Button>}
    </Card>
  );
}

export default function RosterView({ session }) {
  const { rows, changeLog, settings, loading, error, saveRow, deleteRow, updateSettings } = useRoster();
  const { canEditRoster } = useProfile(session.user.id);
  const [view, setView] = useState("roster");
  const [editingRow, setEditingRow] = useState(undefined); // undefined = closed, null = new, object = editing
  const [actionError, setActionError] = useState(null);

  const handleSave = async (existingRow, patch, meta) => {
    try {
      await saveRow(existingRow, patch, meta);
      setActionError(null);
    } catch (err) {
      setActionError(err.message);
      throw err;
    }
  };

  const handleDelete = async (row, meta) => {
    try {
      await deleteRow(row, meta);
      setActionError(null);
    } catch (err) {
      setActionError(err.message);
      throw err;
    }
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Roster</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Governed driver-availability roster</h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
            Feeds Planning Horizon Compliance (KPI 1) and Driver Utilization / Capacity KPIs (4, 11, 13) once reliably maintained.
          </p>
        </div>
        {canEditRoster && (
          <Button size="sm" iconLeft={<Plus size={15} />} onClick={() => setEditingRow(null)}>Add record</Button>
        )}
      </div>

      <GovernanceBar settings={settings} canEdit={canEditRoster} onSave={updateSettings} />

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setView("roster")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, cursor: "pointer",
            border: "1px solid " + (view === "roster" ? "var(--clg-royal)" : "var(--clg-reflection)"),
            background: view === "roster" ? "var(--clg-royal)" : "#fff", color: view === "roster" ? "#fff" : "var(--clg-pewter)",
          }}
        >
          <ListChecks size={13} /> Roster
        </button>
        <button
          onClick={() => setView("log")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, cursor: "pointer",
            border: "1px solid " + (view === "log" ? "var(--clg-royal)" : "var(--clg-reflection)"),
            background: view === "log" ? "var(--clg-royal)" : "#fff", color: view === "log" ? "#fff" : "var(--clg-pewter)",
          }}
        >
          <History size={13} /> Change log
        </button>
      </div>

      {(error || actionError) && <Alert tone="critical" style={{ marginBottom: 16 }}>{error || actionError}</Alert>}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading roster…
          </div>
        ) : view === "roster" ? (
          rows.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
              No roster records yet. An "Available" driver with no restriction simply has no row here.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                <thead>
                  <tr>
                    {["Driver", "Status", "Reason", "Start", "End", "Days remaining", "Approval", "Effective"].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                        color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const status = rosterStatus(r);
                    const remaining = daysRemaining(r.start_date, r.end_date);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => canEditRoster && setEditingRow(r)}
                        style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: canEditRoster ? "pointer" : "default" }}
                      >
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.driver_name}</td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}><Badge tone={statusTone(status)}>{status}</Badge></td>
                        <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.unavailable_reason || "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.start_date || "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.end_date || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{remaining ?? "—"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.approval || "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.effective_date || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : changeLog.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            No changes logged yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
              <thead>
                <tr>
                  {["Date", "Changed by", "Driver", "Field", "Old value", "New value", "Reason"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changeLog.map((c, i) => (
                  <tr key={c.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>
                      {new Date(c.changed_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.changed_by}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.driver_affected}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.field_changed}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.old_value || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.new_value || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", maxWidth: 260, borderBottom: "1px solid var(--clg-border-subtle)" }}>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editingRow !== undefined && (
        <RosterFormModal
          row={editingRow}
          onClose={() => setEditingRow(undefined)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
