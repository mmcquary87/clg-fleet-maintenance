import { useState } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { CADENCE_OPTIONS, DAY_LABELS, MONTH_OCCURRENCE_OPTIONS } from "../../lib/homeTimeSchedule";
import DriverPicker from "./DriverPicker";

function emptyForm() {
  return {
    driver_name: "", cadence: "weekly", days_of_week: [], anchor_date: "", month_occurrence: 1,
    effective_start_date: new Date().toISOString().slice(0, 10), effective_end_date: "", approval: "", notes: "",
  };
}

export default function HomeTimeFormModal({ row, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(row ? {
    driver_name: row.driver_name, driver_id: row.driver_id || null, cadence: row.cadence, days_of_week: row.days_of_week || [],
    anchor_date: row.anchor_date || "", month_occurrence: row.month_occurrence ?? 1,
    effective_start_date: row.effective_start_date || "", effective_end_date: row.effective_end_date || "",
    approval: row.approval || "", notes: row.notes || "",
  } : { ...emptyForm(), driver_id: null });
  const [changedBy, setChangedBy] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleDay = (d) => {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(d) ? f.days_of_week.filter((x) => x !== d) : [...f.days_of_week, d],
    }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.days_of_week.length === 0) { setError("Pick at least one day of the week."); return; }
    if (form.cadence === "biweekly" && !form.anchor_date) { setError("Biweekly schedules need an anchor date."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const patch = {
        driver_name: form.driver_name.trim(),
        driver_id: form.driver_id,
        cadence: form.cadence,
        days_of_week: form.days_of_week,
        anchor_date: form.cadence === "biweekly" ? form.anchor_date : null,
        month_occurrence: form.cadence === "monthly_nth" ? Number(form.month_occurrence) : null,
        effective_start_date: form.effective_start_date,
        effective_end_date: form.effective_end_date || null,
        approval: form.approval.trim() || null,
        notes: form.notes.trim() || null,
      };
      await onSave(row || null, patch, { changedBy, reason });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onRemove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onDelete(row, { changedBy, reason });
      onClose();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <Card style={{ width: "100%", maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>{row ? "Edit home-time schedule" : "New home-time schedule"}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
        </div>

        {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <DriverPicker
              value={form.driver_name} driverId={form.driver_id}
              onChange={({ name, driverId }) => setForm({ ...form, driver_name: name, driver_id: driverId })}
            />

            <Field label="Cadence" required>
              <Select value={form.cadence} onChange={set("cadence")} options={CADENCE_OPTIONS} />
            </Field>

            {form.cadence === "biweekly" && (
              <Field label="Anchor date" required help="A date they were actually home — establishes which week is 'on'">
                <Input type="date" required value={form.anchor_date} onChange={set("anchor_date")} />
              </Field>
            )}
            {form.cadence === "monthly_nth" && (
              <Field label="Which occurrence" required>
                <Select value={form.month_occurrence} onChange={set("month_occurrence")} options={MONTH_OCCURRENCE_OPTIONS} />
              </Field>
            )}

            <Field label="Days of week" required style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {DAY_LABELS.map((label, d) => (
                  <button
                    key={d} type="button" onClick={() => toggleDay(d)}
                    style={{
                      width: 42, padding: "8px 0", fontSize: 12, cursor: "pointer",
                      border: "1px solid " + (form.days_of_week.includes(d) ? "var(--clg-royal)" : "var(--clg-reflection)"),
                      background: form.days_of_week.includes(d) ? "var(--clg-royal)" : "#fff",
                      color: form.days_of_week.includes(d) ? "#fff" : "var(--clg-pewter)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Effective start" required>
              <Input type="date" required value={form.effective_start_date} onChange={set("effective_start_date")} />
            </Field>
            <Field label="Effective end" help="Blank = ongoing">
              <Input type="date" value={form.effective_end_date} onChange={set("effective_end_date")} />
            </Field>
            <Field label="Approval" help="Who approved this standing schedule">
              <Input value={form.approval} onChange={set("approval")} placeholder="e.g. Dispatch lead" />
            </Field>
            <Field label="Notes" help="Optional">
              <Input value={form.notes} onChange={set("notes")} placeholder="Anything worth noting" />
            </Field>
          </div>

          <div style={{ borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
              Change log entry — required for every save
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Changed by" required>
                <Input required value={changedBy} onChange={(e) => setChangedBy(e.target.value)} placeholder="Your name" />
              </Field>
              <Field label="Reason" required>
                <Input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. New standing bid, approved by dispatch" />
              </Field>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {row && (
                <Button type="button" variant="outline" size="sm" iconLeft={<Trash2 size={13} />} onClick={onRemove} disabled={submitting}>
                  Remove
                </Button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting && <Loader2 size={14} className="spin" />}
                Save
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
