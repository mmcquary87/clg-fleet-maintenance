import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusPill, Select, Alert, Eyebrow } from "../../ds";
import { useTasks } from "../../hooks/useTasks";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import LeadDetailModal from "./LeadDetailModal";
import OnboardingCaseModal from "../onboarding/OnboardingCaseModal";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}
function isOverdue(t) {
  return t.status === "open" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
}

export default function TasksView() {
  const { session } = useAuth();
  const [statusFilter, setStatusFilter] = useState("open");
  const [mineOnly, setMineOnly] = useState(false);
  const { tasks, loading, error, reload } = useTasks({ statusFilter, ownerId: mineOnly ? session?.user?.id : undefined });
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  const sorted = useMemo(() => [...tasks].sort((a, b) => (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0)), [tasks]);

  const complete = async (task) => {
    await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    reload();
  };

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Recruiting</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 150 }}>
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          </div>
          <button
            type="button" onClick={() => setMineOnly((v) => !v)}
            style={{
              padding: "9px 14px", borderRadius: "var(--clg-radius-pill)", border: "1px solid " + (mineOnly ? "var(--clg-royal)" : "var(--clg-border-default)"),
              background: mineOnly ? "var(--clg-royal)" : "transparent", color: mineOnly ? "#fff" : "var(--clg-text-body)", fontSize: 12.5, cursor: "pointer",
            }}
          >
            Mine only
          </button>
        </div>
      </div>

      {error && <Alert tone="critical" title="Couldn't load tasks" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading tasks…
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No tasks match these filters.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", overflow: "hidden" }}>
          {sorted.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", borderBottom: "1px solid var(--clg-border-subtle)" }}>
              {t.status === "open" && <input type="checkbox" onChange={() => complete(t)} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => { if (t.lead_id) setSelectedLeadId(t.lead_id); else if (t.case_id) setSelectedCaseId(t.case_id); }}
                  style={{ background: "none", border: "none", padding: 0, cursor: t.lead_id || t.case_id ? "pointer" : "default", textAlign: "left", fontSize: 13, color: "var(--clg-text-body)", fontWeight: 600 }}
                >
                  {t.subject}
                </button>
                {t.recordName && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{t.recordName}</div>}
              </div>
              {t.priority === "high" && <span style={{ fontSize: 10.5, color: "var(--clg-scarlet)", fontWeight: 700 }}>HIGH</span>}
              <span style={{ fontSize: 12, color: isOverdue(t) ? "var(--clg-scarlet)" : "var(--clg-text-muted)" }}>{fmtDate(t.due_date)}</span>
              <span style={{ fontSize: 12, color: "var(--clg-text-muted)", width: 100 }}>{t.ownerName || "Unassigned"}</span>
              {t.status !== "open" && <StatusPill tone={t.status === "completed" ? "green" : "neutral"}>{t.status}</StatusPill>}
            </div>
          ))}
        </div>
      )}

      {selectedLeadId && <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onLeadChanged={reload} />}
      {selectedCaseId && <OnboardingCaseModal caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} onCaseChanged={reload} />}
    </div>
  );
}
