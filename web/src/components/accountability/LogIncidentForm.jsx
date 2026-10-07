import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import DriverPicker from "../roster/DriverPicker";
import { useAccountabilityInfractions } from "../../hooks/useAccountabilityInfractions";

const COACHING_STAGES = ["First Infraction", "Second Infraction", "Third Infraction", "Driver Being Fined", "Final Warning", "Termination"];
const APPEAL_STATUSES = ["Not Submitted", "Pending", "Approved", "Denied"];

function textareaStyle() {
  return {
    width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: "var(--clg-size-body)",
    color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
    borderRadius: "var(--clg-radius-sm)", padding: "11px 12px", resize: "vertical",
  };
}

export default function LogIncidentForm({ session, onCancel, onSaved }) {
  const { infractions, loading: infractionsLoading } = useAccountabilityInfractions();

  const [driverName, setDriverName] = useState("");
  const [driverId, setDriverId] = useState(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [infractionId, setInfractionId] = useState("");
  const [coachingStage, setCoachingStage] = useState("First Infraction");
  const [notes, setNotes] = useState("");
  const [driverResponse, setDriverResponse] = useState("");
  const [issuedBy, setIssuedBy] = useState(session?.user?.email ?? "");
  const [followUpDate, setFollowUpDate] = useState("");
  const [trainingAssigned, setTrainingAssigned] = useState(false);
  const [trainingDueDate, setTrainingDueDate] = useState("");
  const [appealStatus, setAppealStatus] = useState("Not Submitted");
  const [appealNotes, setAppealNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selectedInfraction = infractions.find((i) => i.id === infractionId);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!driverId) {
      setError("Choose a driver from the list (use \"+ Add a new driver\" if they're not synced yet).");
      return;
    }
    if (!infractionId) {
      setError("Choose an infraction.");
      return;
    }
    if (!issuedBy.trim()) {
      setError("Who is issuing this? (Issued by)");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("driver_incidents").insert({
      driver_id: driverId,
      event_date: eventDate,
      infraction_id: infractionId,
      coaching_stage: coachingStage,
      notes: notes.trim() || null,
      driver_response: driverResponse.trim() || null,
      issued_by: issuedBy.trim(),
      follow_up_date: followUpDate || null,
      training_assigned: trainingAssigned,
      training_due_date: trainingAssigned ? (trainingDueDate || null) : null,
      appeal_status: appealStatus,
      appeal_notes: appealNotes.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
    } else {
      onSaved();
    }
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>Log incident</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
          <DriverPicker value={driverName} driverId={driverId} onChange={({ name, driverId: id }) => { setDriverName(name); setDriverId(id); }} />

          <Field label="Event date" required>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>

          <Field label="Infraction" required style={{ gridColumn: "1 / -1" }}>
            <Select
              value={infractionId}
              onChange={(e) => setInfractionId(e.target.value)}
              disabled={infractionsLoading}
              placeholder="Choose an infraction"
              options={infractions.map((i) => ({ value: i.id, label: `${i.name} — ${i.violation_family} (${i.severity})` }))}
            />
            {selectedInfraction && (
              <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
                {selectedInfraction.points} point{selectedInfraction.points === 1 ? "" : "s"} · ${selectedInfraction.fine_amount} fine if eligible ·
                rolls off after {selectedInfraction.rollover_days} days
              </div>
            )}
          </Field>

          <Field label="Coaching stage" required>
            <Select value={coachingStage} onChange={(e) => setCoachingStage(e.target.value)} options={COACHING_STAGES} />
          </Field>
          <Field label="Issued by" required>
            <Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Name of the manager/safety lead" />
          </Field>

          <Field label="Conversation / coaching notes" style={{ gridColumn: "1 / -1" }}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={textareaStyle()} />
          </Field>
          <Field label="Driver response" style={{ gridColumn: "1 / -1" }}>
            <textarea value={driverResponse} onChange={(e) => setDriverResponse(e.target.value)} rows={2} style={textareaStyle()} />
          </Field>

          <Field label="Follow-up date" help="Optional">
            <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
          <Field label="Training assigned?">
            <Select
              value={trainingAssigned ? "yes" : "no"}
              onChange={(e) => setTrainingAssigned(e.target.value === "yes")}
              options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]}
            />
          </Field>
          {trainingAssigned && (
            <Field label="Training due date">
              <Input type="date" value={trainingDueDate} onChange={(e) => setTrainingDueDate(e.target.value)} />
            </Field>
          )}

          <Field label="Appeal status">
            <Select value={appealStatus} onChange={(e) => setAppealStatus(e.target.value)} options={APPEAL_STATUSES} />
          </Field>
          {appealStatus !== "Not Submitted" && (
            <Field label="Appeal notes" style={{ gridColumn: "1 / -1" }}>
              <textarea value={appealNotes} onChange={(e) => setAppealNotes(e.target.value)} rows={2} style={textareaStyle()} />
            </Field>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="spin" />}
            Save incident
          </Button>
        </div>
      </form>
    </Card>
  );
}
