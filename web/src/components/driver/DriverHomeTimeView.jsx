import { useState } from "react";
import { Plus, Loader2, CalendarClock } from "lucide-react";
import { Card, Field, Input, Button, Badge, Eyebrow, Alert } from "../../ds";
import { useHomeTimeRequests } from "../../hooks/useHomeTimeRequests";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(status) {
  if (status === "approved") return "brand";
  if (status === "denied") return "critical";
  return "neutral";
}

function emptyForm() {
  return { startDate: todayIso(), endDate: todayIso(), reason: "" };
}

// First driver self-service feature (2026-10-10): request home-time/time
// off instead of only dispatch entering standing schedules on your
// behalf. A request here never touches planned_home_time (the standing
// recurring schedule dispatch manages) -- it's a separate intake/approval
// trail dispatch decides on from HomeTimeView's own Requests tab, same
// table, RLS scoped so each driver only ever sees their own rows.
export default function DriverHomeTimeView({ driverId }) {
  const { requests, loading, error, submitRequest } = useHomeTimeRequests();
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!driverId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitRequest({ driverId, startDate: form.startDate, endDate: form.endDate, reason: form.reason });
      setForm(null);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Home time</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Request home time</h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
            Submit a request and dispatch will approve or deny it.
          </p>
        </div>
        {form === null && (
          <Button size="sm" iconLeft={<Plus size={15} />} onClick={() => setForm(emptyForm())} disabled={!driverId}>
            New request
          </Button>
        )}
      </div>

      {!driverId && (
        <Alert tone="critical" style={{ marginBottom: 16 }}>
          Your account isn't linked to a driver record yet — ask dispatch to set this up before you can submit a request.
        </Alert>
      )}

      {form !== null && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={submit}>
            {submitError && <Alert tone="critical" title="Couldn't submit" style={{ marginBottom: 16 }}>{submitError}</Alert>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <Field label="Start date" required>
                <Input type="date" required value={form.startDate} onChange={set("startDate")} />
              </Field>
              <Field label="End date" required>
                <Input type="date" required value={form.endDate} min={form.startDate} onChange={set("endDate")} />
              </Field>
            </div>
            <Field label="Reason" help="Optional" style={{ marginBottom: 16 }}>
              <Input value={form.reason} onChange={set("reason")} placeholder="e.g. Family event" />
            </Field>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting} iconLeft={submitting ? <Loader2 size={14} className="spin" /> : null}>
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <Alert tone="critical" style={{ marginBottom: 16 }}>{error}</Alert>}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading…
          </div>
        ) : requests.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)" }}>
            <CalendarClock size={24} />
            <div style={{ fontSize: 13 }}>No requests yet.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {requests.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                  padding: "14px 18px", background: i % 2 ? "var(--clg-surface-subtle)" : "transparent",
                  borderBottom: i < requests.length - 1 ? "1px solid var(--clg-border-subtle)" : "none",
                }}
              >
                <div>
                  <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14, color: "var(--clg-navy)" }}>
                    {r.start_date}{r.start_date !== r.end_date ? ` → ${r.end_date}` : ""}
                  </div>
                  {r.reason && <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2 }}>{r.reason}</div>}
                  {r.status !== "pending" && (
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
                      {r.status === "approved" ? "Approved" : "Denied"} by {r.decided_by || "—"}
                      {r.decision_note ? ` — ${r.decision_note}` : ""}
                    </div>
                  )}
                </div>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
