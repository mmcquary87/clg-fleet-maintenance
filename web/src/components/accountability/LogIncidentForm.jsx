import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import DriverPicker from "../roster/DriverPicker";
import { useAccountabilityInfractions } from "../../hooks/useAccountabilityInfractions";
import { COACHING_STAGES, APPEAL_STATUSES, TRAINING_PLATFORMS } from "../../lib/accountabilityEnums";

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
  // One coaching call can cover several infractions. Each ticked infraction
  // becomes its own driver_incidents row (so points, rollover, fines and the
  // stage ladder all keep working per infraction); the date, notes, driver
  // response, follow-up, training and appeal fields are shared by the call.
  const [infractionIds, setInfractionIds] = useState([]);
  const [suggestedStages, setSuggestedStages] = useState({}); // id -> stage from the ladder
  const [manualStages, setManualStages] = useState({}); // id -> stage Safety picked by hand
  const [notes, setNotes] = useState("");
  const [driverResponse, setDriverResponse] = useState("");
  const [issuedBy, setIssuedBy] = useState(session?.user?.email ?? "");
  const [followUpDate, setFollowUpDate] = useState("");
  const [trainingAssigned, setTrainingAssigned] = useState(false);
  const [trainingDueDate, setTrainingDueDate] = useState("");
  const [trainingPlatform, setTrainingPlatform] = useState("");
  const [appealStatus, setAppealStatus] = useState("Not Submitted");
  const [appealNotes, setAppealNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Keep the ticked infractions in catalog order so the stage rows and the
  // saved records read the same way every time.
  const selectedInfractions = infractions.filter((i) => infractionIds.includes(i.id));
  const selectedKey = selectedInfractions.map((i) => i.id).join(",");
  const totalPoints = selectedInfractions.reduce((sum, i) => sum + (Number(i.points) || 0), 0);

  const stageFor = (id) => manualStages[id] ?? suggestedStages[id] ?? COACHING_STAGES[0];

  const toggleInfraction = (id) => {
    setInfractionIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  // Suggestion only, not automation (CLG direction, 2026-10-28) --
  // accountability_suggested_coaching_stage counts this driver's active
  // same-family infractions and proposes the next step in the 6-stage
  // ladder; Safety can still pick a different stage before saving (the
  // official doc's "may skip steps" provision). Re-suggests whenever the
  // driver or the ticked infractions change; a stage picked by hand sticks.
  // If two ticked infractions are in the same family, the later one is
  // suggested one step further along: this call itself adds the earlier one.
  useEffect(() => {
    if (!driverId || selectedInfractions.length === 0) return undefined;
    let cancelled = false;
    const seen = new Map(); // family -> how many earlier ticked infractions share it
    const jobs = selectedInfractions.map((inf) => {
      const offset = seen.get(inf.violation_family) ?? 0;
      seen.set(inf.violation_family, offset + 1);
      return supabase.rpc("accountability_suggested_coaching_stage", {
        p_driver_id: driverId,
        p_violation_family: inf.violation_family,
      }).then(({ data, error: rpcError }) => {
        if (rpcError || !data) return null;
        const idx = Math.min(COACHING_STAGES.indexOf(data) + offset, COACHING_STAGES.length - 1);
        return [inf.id, COACHING_STAGES[Math.max(idx, 0)]];
      });
    });
    Promise.all(jobs).then((pairs) => {
      if (cancelled) return;
      setSuggestedStages(Object.fromEntries(pairs.filter(Boolean)));
    });
    return () => { cancelled = true; };
    // selectedKey stands in for selectedInfractions (a new array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, selectedKey]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!driverId) {
      setError("Choose a driver from the list (use \"+ Add a new driver\" if they're not synced yet).");
      return;
    }
    if (selectedInfractions.length === 0) {
      setError("Choose at least one infraction.");
      return;
    }
    if (!issuedBy.trim()) {
      setError("Who is issuing this? (Issued by)");
      return;
    }

    setSubmitting(true);
    setError(null);
    // One request = one transaction: either every infraction from this call is
    // saved or none is, so a failure can't leave a half-logged coaching call.
    const { error: err } = await supabase.from("driver_incidents").insert(
      selectedInfractions.map((inf) => ({
        driver_id: driverId,
        event_date: eventDate,
        infraction_id: inf.id,
        coaching_stage: stageFor(inf.id),
        notes: notes.trim() || null,
        driver_response: driverResponse.trim() || null,
        issued_by: issuedBy.trim(),
        follow_up_date: followUpDate || null,
        training_assigned: trainingAssigned,
        training_due_date: trainingAssigned ? (trainingDueDate || null) : null,
        training_platform: trainingAssigned ? (trainingPlatform || null) : null,
        appeal_status: appealStatus,
        appeal_notes: appealNotes.trim() || null,
      })),
    );
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
          <DriverPicker
            value={driverName}
            driverId={driverId}
            onChange={({ name, driverId: id }) => { setDriverName(name); setDriverId(id); }}
            activeOnly
          />

          <Field label="Event date" required>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>

          <Field label="Infractions" required help="Tick every topic covered on this call" style={{ gridColumn: "1 / -1" }}>
            <div
              role="group"
              aria-label="Infractions"
              style={{
                maxHeight: 220, overflowY: "auto", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
                background: "var(--clg-surface-page)", padding: "6px 12px",
              }}
            >
              {infractionsLoading && <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", padding: "6px 0" }}>Loading infractions…</div>}
              {infractions.map((i) => (
                <label key={i.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={infractionIds.includes(i.id)}
                    onChange={() => toggleInfraction(i.id)}
                    style={{ marginTop: 2 }}
                  />
                  <span>{i.name} — {i.violation_family} ({i.severity})</span>
                </label>
              ))}
            </div>
          </Field>

          {selectedInfractions.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13, color: "var(--clg-navy)", marginBottom: 4 }}>
                Coaching stage per infraction
              </div>
              <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 8 }}>
                Suggested from this driver's active infractions in the same family — change any stage if the situation calls for skipping a step.
                {" "}{selectedInfractions.length} record{selectedInfractions.length === 1 ? "" : "s"} will be saved · {totalPoints} point{totalPoints === 1 ? "" : "s"} total.
              </div>
              {selectedInfractions.map((inf) => (
                <div key={inf.id} style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{inf.name}</div>
                    <div style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
                      {inf.points} point{inf.points === 1 ? "" : "s"} · ${inf.fine_amount} fine if eligible · rolls off after {inf.rollover_days} days
                      {!manualStages[inf.id] && suggestedStages[inf.id] ? " · stage suggested" : ""}
                    </div>
                  </div>
                  <Select
                    value={stageFor(inf.id)}
                    onChange={(e) => setManualStages((cur) => ({ ...cur, [inf.id]: e.target.value }))}
                    options={COACHING_STAGES}
                  />
                </div>
              ))}
            </div>
          )}

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
          {trainingAssigned && (
            <Field label="Training platform">
              <Select
                value={trainingPlatform}
                onChange={(e) => setTrainingPlatform(e.target.value)}
                placeholder="Choose a platform"
                options={TRAINING_PLATFORMS}
              />
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
