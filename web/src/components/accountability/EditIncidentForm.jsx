import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { useAccountabilityInfractions } from "../../hooks/useAccountabilityInfractions";
import { COACHING_STAGES, APPEAL_STATUSES, TRAINING_PLATFORMS } from "../../lib/accountabilityEnums";

function textareaStyle() {
  return {
    width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: "var(--clg-size-body)",
    color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
    borderRadius: "var(--clg-radius-sm)", padding: "11px 12px", resize: "vertical",
  };
}

// Edits one logged incident in place. The driver is fixed (to move an incident to
// another driver, delete it and log it again). Points, severity and fine come from
// the infraction, so changing the infraction changes them. The coaching stage is
// whatever you pick here: editing never re-suggests or re-bundles anything.
export default function EditIncidentForm({ incidentId, driverName, onCancel, onSaved }) {
  const { infractions } = useAccountabilityInfractions();
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load the full row (the list view doesn't carry infraction_id).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.from("driver_incidents").select("*").eq("id", incidentId).single();
      if (cancelled) return;
      if (err) { setLoadError(err.message); return; }
      setForm({
        event_date: data.event_date ?? "",
        infraction_id: data.infraction_id,
        coaching_stage: data.coaching_stage,
        issued_by: data.issued_by ?? "",
        notes: data.notes ?? "",
        driver_response: data.driver_response ?? "",
        follow_up_date: data.follow_up_date ?? "",
        training_assigned: !!data.training_assigned,
        training_due_date: data.training_due_date ?? "",
        training_platform: data.training_platform ?? "",
        training_completed_date: data.training_completed_date ?? "",
        appeal_status: data.appeal_status,
        appeal_notes: data.appeal_notes ?? "",
      });
    })();
    return () => { cancelled = true; };
  }, [incidentId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.event_date) { setError("Choose the event date."); return; }
    if (!form.issued_by.trim()) { setError("Who issued this? (Issued by)"); return; }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("driver_incidents").update({
      event_date: form.event_date,
      infraction_id: form.infraction_id,
      coaching_stage: form.coaching_stage,
      issued_by: form.issued_by.trim(),
      notes: form.notes.trim() || null,
      driver_response: form.driver_response.trim() || null,
      follow_up_date: form.follow_up_date || null,
      training_assigned: form.training_assigned,
      training_due_date: form.training_assigned ? (form.training_due_date || null) : null,
      training_platform: form.training_assigned ? (form.training_platform || null) : null,
      training_completed_date: form.training_assigned ? (form.training_completed_date || null) : null,
      appeal_status: form.appeal_status,
      appeal_notes: form.appeal_status !== "Not Submitted" ? (form.appeal_notes.trim() || null) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", incidentId);
    setSubmitting(false);
    if (err) setError(err.message);
    else onSaved();
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>Edit incident — {driverName}</h3>
        <button type="button" onClick={onCancel} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {loadError && <Alert tone="critical" style={{ marginBottom: 14 }}>Couldn't load this incident: {loadError}</Alert>}
      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}
      {!form && !loadError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clg-cool)", padding: "12px 0" }}>
          <Loader2 size={16} className="spin" /> Loading…
        </div>
      )}

      {form && (
        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
            <Field label="Event date" required>
              <Input type="date" value={form.event_date} onChange={set("event_date")} />
            </Field>
            <Field label="Infraction" required>
              <Select
                value={form.infraction_id}
                onChange={set("infraction_id")}
                options={infractions.map((i) => ({ value: i.id, label: `${i.name} — ${i.violation_family} (${i.severity})` }))}
              />
            </Field>
            <Field label="Coaching stage" required>
              <Select value={form.coaching_stage} onChange={set("coaching_stage")} options={COACHING_STAGES} />
            </Field>
            <Field label="Issued by" required>
              <Input value={form.issued_by} onChange={set("issued_by")} />
            </Field>
            <Field label="Conversation / coaching notes" style={{ gridColumn: "1 / -1" }}>
              <textarea value={form.notes} onChange={set("notes")} rows={3} style={textareaStyle()} />
            </Field>
            <Field label="Driver response" style={{ gridColumn: "1 / -1" }}>
              <textarea value={form.driver_response} onChange={set("driver_response")} rows={2} style={textareaStyle()} />
            </Field>
            <Field label="Follow-up date" help="Optional">
              <Input type="date" value={form.follow_up_date} onChange={set("follow_up_date")} />
            </Field>
            <Field label="Training assigned?">
              <Select
                value={form.training_assigned ? "yes" : "no"}
                onChange={(e) => setForm((f) => ({ ...f, training_assigned: e.target.value === "yes" }))}
                options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]}
              />
            </Field>
            {form.training_assigned && (
              <>
                <Field label="Training due date"><Input type="date" value={form.training_due_date} onChange={set("training_due_date")} /></Field>
                <Field label="Training platform">
                  <Select value={form.training_platform} onChange={set("training_platform")} placeholder="Choose a platform" options={TRAINING_PLATFORMS} />
                </Field>
                <Field label="Training completed" help="Optional">
                  <Input type="date" value={form.training_completed_date} onChange={set("training_completed_date")} />
                </Field>
              </>
            )}
            <Field label="Appeal status">
              <Select value={form.appeal_status} onChange={set("appeal_status")} options={APPEAL_STATUSES} />
            </Field>
            {form.appeal_status !== "Not Submitted" && (
              <Field label="Appeal notes" style={{ gridColumn: "1 / -1" }}>
                <textarea value={form.appeal_notes} onChange={set("appeal_notes")} rows={2} style={textareaStyle()} />
              </Field>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 size={14} className="spin" />}
              Save changes
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
