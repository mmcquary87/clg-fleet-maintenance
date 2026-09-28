import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, Input, Select, Button, Alert } from "../../ds";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";

// Free-form activity logging for a lead or an onboarding case (pass exactly
// one of leadId/caseId) -- a call, a text exchange, an in-person
// conversation, or just an internal note -- distinct from
// OutreachDraftPanel's "mark as sent" (which only ever logs an outbound
// email/sms draft). Writes straight to lead_conversations; there's no
// separate "calls" table, so a phone call is just channel: "phone" here.
const CHANNEL_OPTIONS = [
  { value: "phone", label: "Phone call" },
  { value: "sms", label: "Text message" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In person" },
  { value: "dat", label: "DAT / load board" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];
const DIRECTION_OPTIONS = [
  { value: "outbound", label: "I reached out to them" },
  { value: "inbound", label: "They reached out to me" },
  { value: "internal_note", label: "Internal note (no contact)" },
];

export default function LogInteractionForm({ leadId, caseId, onCancel, onLogged }) {
  const { session } = useAuth();
  const [channel, setChannel] = useState("phone");
  const [direction, setDirection] = useState("outbound");
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDue, setNextStepDue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!summary.trim()) {
      setError("Give a short summary of what happened.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("lead_conversations").insert({
      lead_id: leadId ?? null,
      case_id: caseId ?? null,
      channel,
      direction,
      author: session?.user?.email || "unknown",
      summary: summary.trim(),
      next_step: nextStep.trim() || null,
      next_step_due: nextStepDue || null,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    onLogged();
  };

  return (
    <form onSubmit={onSubmit} style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 16, marginBottom: 12 }}>
      {error && <Alert tone="critical" style={{ marginBottom: 12 }}>{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 14 }}>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} options={CHANNEL_OPTIONS} />
        </Field>
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value)} options={DIRECTION_OPTIONS} />
        </Field>
        <Field label="What happened" style={{ gridColumn: "1 / -1" }} required>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Called, left voicemail about lease-on terms" />
        </Field>
        <Field label="Next step (optional)">
          <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Follow up call" />
        </Field>
        <Field label="Next step due (optional)">
          <Input type="date" value={nextStepDue} onChange={(e) => setNextStepDue(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting && <Loader2 size={14} className="spin" />}
          Log it
        </Button>
      </div>
    </form>
  );
}
