import { useState } from "react";
import { X, Loader2, Check, ShieldOff, Play, Phone } from "lucide-react";
import { Badge, StatusPill, Alert, Button, Input } from "../../ds";
import { useOnboardingCaseDetail } from "../../hooks/useOnboardingCaseDetail";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";
import TasksPanel from "../recruiting/TasksPanel";
import LogInteractionForm from "../recruiting/LogInteractionForm";
import ConversationsPanel from "../recruiting/ConversationsPanel";

const PATHWAY_LABELS = { company_driver: "Company driver", lease_on: "Lease-on", brokerage_carrier: "Brokerage carrier" };
const CASE_STATUS_TONES = { cleared: "green", withdrawn: "red", rejected: "red", on_hold: "neutral", open: "brand" };
const STEP_STATUS_TONES = { complete: "green", waived: "neutral", failed: "red", in_progress: "yellow", not_started: "pending" };

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

function StepRow({ step, email, onChanged }) {
  const [docUrl, setDocUrl] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [showWaive, setShowWaive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("onboarding_case_steps").update({ status: "in_progress" }).eq("id", step.id);
    setBusy(false);
    if (err) setError(err.message); else onChanged();
  };

  const complete = async () => {
    if (step.requires_document && !docUrl.trim()) { setError("This step requires a document link before it can be marked complete."); return; }
    setBusy(true);
    setError(null);
    let documentId = step.document_id;
    if (step.requires_document && !documentId) {
      const { data: doc, error: docErr } = await supabase.from("documents").insert({
        case_id: step.case_id, doc_type: step.step_code, storage_url: docUrl.trim(), uploaded_by: email,
      }).select("id").single();
      if (docErr) { setBusy(false); setError(docErr.message); return; }
      documentId = doc.id;
    }
    const { error: err } = await supabase.from("onboarding_case_steps").update({
      status: "complete", completed_by: email, completed_at: new Date().toISOString(), document_id: documentId,
    }).eq("id", step.id);
    setBusy(false);
    if (err) setError(err.message); else onChanged();
  };

  const waive = async () => {
    if (!waiveReason.trim()) { setError("A waiver needs a reason."); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("onboarding_case_steps").update({
      status: "waived", waiver_reason: waiveReason.trim(), waived_by: email,
    }).eq("id", step.id);
    setBusy(false);
    if (err) setError(err.message); else onChanged();
  };

  const done = step.status === "complete" || step.status === "waived" || step.status === "failed";

  return (
    <div style={{ padding: "10px 12px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <StatusPill tone={STEP_STATUS_TONES[step.status] || "neutral"} style={{ flexShrink: 0 }}>{step.status.replace(/_/g, " ")}</StatusPill>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-body)" }}>
            {step.name}{step.required && <span style={{ color: "var(--clg-scarlet)" }}> *</span>}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
            {step.owner_role}{step.due_date ? " · due " + fmtDate(step.due_date) : ""}{step.requires_document ? " · needs a document" : ""}
          </div>
          {step.status === "complete" && (
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
              Completed by {step.completed_by} on {fmtDate(step.completed_at)}
            </div>
          )}
          {step.status === "waived" && (
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
              Waived by {step.waived_by} — "{step.waiver_reason}"
            </div>
          )}

          {!done && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {step.status === "not_started" && (
                <Button variant="quiet" size="sm" iconLeft={<Play size={12} />} disabled={busy} onClick={start}>Start</Button>
              )}
              {step.requires_document && !step.document_id && (
                <Input placeholder="Document link (URL)" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} disabled={busy} style={{ flex: "1 1 180px", padding: "6px 10px", fontSize: 12.5 }} />
              )}
              <Button variant="outline" size="sm" iconLeft={<Check size={12} />} disabled={busy} onClick={complete}>Complete</Button>
              {showWaive ? (
                <>
                  <Input placeholder="Waiver reason" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} disabled={busy} style={{ flex: "1 1 160px", padding: "6px 10px", fontSize: 12.5 }} />
                  <Button variant="quiet" size="sm" iconLeft={<ShieldOff size={12} />} disabled={busy} onClick={waive}>Confirm waive</Button>
                </>
              ) : (
                <Button variant="quiet" size="sm" iconLeft={<ShieldOff size={12} />} disabled={busy} onClick={() => setShowWaive(true)}>Waive</Button>
              )}
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: "var(--clg-scarlet)", marginTop: 6 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingCaseModal({ caseId, onClose, onCaseChanged }) {
  const { caseRow, template, steps, account, contact, conversations, loading, error, reload } = useOnboardingCaseDetail(caseId);
  const { session } = useAuth();
  const email = session?.user?.email || "unknown";
  const [actionError, setActionError] = useState(null);
  const [reasonInput, setReasonInput] = useState("");
  const [showReasonFor, setShowReasonFor] = useState(null); // "withdrawn" | "rejected" | null
  const [busy, setBusy] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);

  const afterChange = () => { reload(); onCaseChanged?.(); };

  const handleLogged = () => { setShowLogForm(false); afterChange(); };

  const setStatus = async (status, extra = {}) => {
    setBusy(true);
    setActionError(null);
    const { error: err } = await supabase.from("onboarding_cases").update({ status, ...extra }).eq("id", caseId);
    setBusy(false);
    if (err) setActionError(err.message); else { afterChange(); setShowReasonFor(null); setReasonInput(""); }
  };

  const clear = () => setStatus("cleared", { cleared_at: new Date().toISOString(), cleared_by: email });
  const closeWithReason = (status) => {
    if (!reasonInput.trim()) { setActionError("A reason is required."); return; }
    setStatus(status, { closed_reason: reasonInput.trim() });
  };

  const stages = [...new Set(steps.map((s) => s.stage))];
  const requiredOpen = steps.filter((s) => s.required && !["complete", "waived"].includes(s.status));
  const canClose = caseRow && ["open", "on_hold"].includes(caseRow.status);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, .5)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 760,
          boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--clg-text-muted)" }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : error || !caseRow ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--clg-scarlet)", fontSize: 13 }}>{error || "Case not found."}</div>
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge tone="neutral">{PATHWAY_LABELS[caseRow.pathway] || caseRow.pathway}</Badge>
                  <StatusPill tone={CASE_STATUS_TONES[caseRow.status] || "neutral"}>{caseRow.status.replace(/_/g, " ")}</StatusPill>
                </div>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)", marginTop: 6 }}>
                  {account?.legal_name || account?.dba_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unnamed case"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
                  Opened {fmtDate(caseRow.opened_at)}{caseRow.target_start ? " · target start " + fmtDate(caseRow.target_start) : ""}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {template && template.status !== "approved" && (
                <Alert tone="info" title="Can't clear this case yet" style={{ marginBottom: 16 }}>
                  Template v{template.version} is {template.status}, not approved. This case will be blocked from clearing until it is.
                </Alert>
              )}
              {requiredOpen.length > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 16 }}>
                  {requiredOpen.length} required step{requiredOpen.length === 1 ? "" : "s"} still open: {requiredOpen.map((s) => s.name).join(", ")}
                </div>
              )}

              {stages.map((stage) => (
                <div key={stage} style={{ marginTop: 16 }}>
                  <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-navy)", marginBottom: 8 }}>
                    {stage}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {steps.filter((s) => s.stage === stage).map((s) => (
                      <StepRow key={s.id} step={s} email={email} onChanged={afterChange} />
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 20 }}>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-navy)", marginBottom: 10 }}>
                  Activity
                </div>
                {showLogForm ? (
                  <LogInteractionForm caseId={caseRow.id} onCancel={() => setShowLogForm(false)} onLogged={handleLogged} />
                ) : (
                  <Button variant="outline" size="sm" iconLeft={<Phone size={12} />} onClick={() => setShowLogForm(true)} style={{ marginBottom: 12 }}>
                    Log a call or interaction
                  </Button>
                )}
                <ConversationsPanel conversations={conversations} />
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-navy)", marginBottom: 10 }}>
                  Tasks
                </div>
                <TasksPanel caseId={caseRow.id} />
              </div>

              {actionError && <Alert tone="critical" style={{ marginTop: 16 }}>{actionError}</Alert>}

              {canClose && (
                <div style={{ display: "flex", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--clg-border-subtle)", flexWrap: "wrap", alignItems: "center" }}>
                  {caseRow.status === "open" ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus("on_hold")}>Put on hold</Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus("open")}>Resume</Button>
                  )}
                  <Button variant="quiet" size="sm" disabled={busy} onClick={() => setShowReasonFor(showReasonFor === "withdrawn" ? null : "withdrawn")}>Withdraw</Button>
                  <Button variant="quiet" size="sm" disabled={busy} onClick={() => setShowReasonFor(showReasonFor === "rejected" ? null : "rejected")}>Reject</Button>
                  <Button size="sm" disabled={busy} onClick={clear} style={{ marginLeft: "auto" }}>Clear</Button>
                </div>
              )}
              {showReasonFor && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Input placeholder={"Reason for " + showReasonFor} value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} style={{ flex: 1 }} />
                  <Button size="sm" disabled={busy} onClick={() => closeWithReason(showReasonFor)}>Confirm</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
