import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Input, Select, Button, Alert } from "../../ds";
import { useTasks } from "../../hooks/useTasks";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";

const PRIORITY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
];

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}
function isOverdue(t) {
  return t.status === "open" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
}

// A compact tasks list + quick-add, scoped to one lead or one onboarding
// case -- pass exactly one of leadId/caseId.
export default function TasksPanel({ leadId, caseId }) {
  const { tasks, loading, error, reload } = useTasks({ leadId, caseId });
  const { session } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const addTask = async (e) => {
    e.preventDefault();
    if (!subject.trim()) { setFormError("Give the task a subject."); return; }
    setSubmitting(true);
    setFormError(null);
    const { error: err } = await supabase.from("tasks").insert({
      subject: subject.trim(),
      lead_id: leadId || null,
      case_id: caseId || null,
      owner_id: session?.user?.id || null,
      due_date: dueDate || null,
      priority,
    });
    setSubmitting(false);
    if (err) { setFormError(err.message); return; }
    setSubject("");
    setDueDate("");
    setPriority("normal");
    setShowAdd(false);
    reload();
  };

  const complete = async (task) => {
    await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    reload();
  };

  if (loading) return <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}><Loader2 size={13} className="spin" /></div>;
  if (error) return <Alert tone="critical">{error}</Alert>;

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open");

  return (
    <div>
      {open.length === 0 && done.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--clg-text-muted)", marginBottom: 10 }}>No tasks yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {open.map((t) => (
            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" onChange={() => complete(t)} />
              <span style={{ flex: 1, color: isOverdue(t) ? "var(--clg-scarlet)" : "var(--clg-text-body)" }}>{t.subject}</span>
              {t.priority === "high" && <span style={{ fontSize: 10.5, color: "var(--clg-scarlet)", fontWeight: 700 }}>HIGH</span>}
              <span style={{ fontSize: 11.5, color: isOverdue(t) ? "var(--clg-scarlet)" : "var(--clg-text-muted)" }}>{fmtDate(t.due_date)}</span>
            </label>
          ))}
          {done.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--clg-text-muted)" }}>
              <span style={{ flex: 1, textDecoration: "line-through" }}>{t.subject}</span>
              <span>{t.status}</span>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <form onSubmit={addTask} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {formError && <Alert tone="critical">{formError}</Alert>}
          <Input placeholder="Task subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ padding: "6px 10px", fontSize: 12.5 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ padding: "6px 10px", fontSize: 12.5 }} />
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITY_OPTIONS} style={{ padding: "6px 10px", fontSize: 12.5 }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting}>{submitting && <Loader2 size={12} className="spin" />} Add</Button>
          </div>
        </form>
      ) : (
        <Button variant="quiet" size="sm" iconLeft={<Plus size={12} />} onClick={() => setShowAdd(true)}>Add task</Button>
      )}
    </div>
  );
}
