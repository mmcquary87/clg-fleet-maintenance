import { useState } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { ELIGIBILITY_OPTIONS, UNAVAILABLE_REASONS } from "../../lib/rosterStatus";
import DriverPicker from "./DriverPicker";

function emptyForm() {
  return {
    driver_name: "", eligibility: "Eligible", unavailable_reason: "",
    start_date: "", end_date: "", approval: "", effective_date: new Date().toISOString().slice(0, 10),
  };
}

export default function RosterFormModal({ row, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(row ? {
    driver_name: row.driver_name, driver_id: row.driver_id || null, eligibility: row.eligibility, unavailable_reason: row.unavailable_reason || "",
    start_date: row.start_date || "", end_date: row.end_date || "", approval: row.approval || "",
    effective_date: row.effective_date || "",
  } : { ...emptyForm(), driver_id: null });
  const [changedBy, setChangedBy] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const patch = {
        driver_name: form.driver_name.trim(),
        driver_id: form.driver_id,
        eligibility: form.eligibility,
        unavailable_reason: form.unavailable_reason || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        approval: form.approval.trim() || null,
        effective_date: form.effective_date || null,
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
          <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>{row ? "Edit roster record" : "New roster record"}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
        </div>

        {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <DriverPicker
              value={form.driver_name} driverId={form.driver_id}
              onChange={({ name, driverId }) => setForm({ ...form, driver_name: name, driver_id: driverId })}
            />
            <Field label="Eligibility" required>
              <Select value={form.eligibility} onChange={set("eligibility")} options={ELIGIBILITY_OPTIONS} />
            </Field>
            <Field label="Unavailable reason" help="Blank if none">
              <Select value={form.unavailable_reason} onChange={set("unavailable_reason")} options={UNAVAILABLE_REASONS} placeholder="None" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.start_date} onChange={set("start_date")} />
            </Field>
            <Field label="End date">
              <Input type="date" value={form.end_date} onChange={set("end_date")} />
            </Field>
            <Field label="Approval" help="Who approved this leave/hold">
              <Input value={form.approval} onChange={set("approval")} placeholder="e.g. M. Rodriguez (HR)" />
            </Field>
            <Field label="Effective date">
              <Input type="date" value={form.effective_date} onChange={set("effective_date")} />
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
                <Input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Approved leave, HR ticket #2201" />
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
