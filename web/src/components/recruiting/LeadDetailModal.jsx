import { X, Loader2 } from "lucide-react";
import { Badge, StatusPill, Alert } from "../../ds";
import { useLeadDetail } from "../../hooks/useLeadDetail";

const SEGMENT_LABELS = { new_mc: "New MC", small_fleet: "Small fleet", driver: "Driver" };
const SEGMENT_TONES = { new_mc: "brand", small_fleet: "neutral", driver: "accent" };
const STATUS_TONES = {
  signed: "green", onboarding: "green",
  disqualified: "red", lost: "red", do_not_contact: "red",
};
const FLAG_SEVERITY_ORDER = { disqualifying: 0, review: 1, info: 2 };
const FLAG_SEVERITY_TONE = { disqualifying: "red", review: "yellow", info: "neutral" };

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}
function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}
function prettifyCode(code) {
  return (code || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
function fmtPct(n) {
  return n == null ? "—" : `${Number(n).toFixed(1)}%`;
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ScoreSummary({ lead }) {
  if (lead.disqualified_reason) {
    return (
      <Alert tone="critical" title="Disqualified">{lead.disqualified_reason}</Alert>
    );
  }
  if (lead.score_status === "pending" || lead.fit_score == null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusPill tone="pending">Pending — not enough data to score yet</StatusPill>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)" }}>
        {lead.fit_score}<span style={{ fontSize: 13, color: "var(--clg-text-muted)", fontWeight: 500 }}>/100</span>
      </div>
      {lead.score_status === "provisional" && (
        <StatusPill tone="pending">Provisional — scoring model not yet approved</StatusPill>
      )}
      {lead.score_coverage != null && (
        <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>{Math.round(lead.score_coverage * 100)}% data coverage</span>
      )}
    </div>
  );
}

function SnapshotPanel({ snapshot }) {
  if (!snapshot) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No FMCSA snapshot on file yet.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
      <Field label="Safety rating" value={snapshot.safety_rating || "Not rated"} />
      <Field label="Power units" value={snapshot.power_units ?? "—"} />
      <Field label="Drivers" value={snapshot.drivers ?? "—"} />
      <Field label="Allowed to operate" value={snapshot.allowed_to_operate === null ? "—" : snapshot.allowed_to_operate ? "Yes" : "No"} />
      <Field label="Common authority" value={snapshot.common_authority_status || "—"} />
      <Field label="Contract authority" value={snapshot.contract_authority_status || "—"} />
      <Field label="Driver OOS rate" value={snapshot.driver_oos_rate != null ? `${fmtPct(snapshot.driver_oos_rate)} (natl. ${fmtPct(snapshot.driver_oos_rate_natl)})` : "—"} />
      <Field label="Vehicle OOS rate" value={snapshot.vehicle_oos_rate != null ? `${fmtPct(snapshot.vehicle_oos_rate)} (natl. ${fmtPct(snapshot.vehicle_oos_rate_natl)})` : "—"} />
      <Field label="Crashes (total)" value={snapshot.crash_total ?? "—"} />
      <Field label="Fatal crashes" value={snapshot.fatal_crash ?? "—"} />
      <Field label="BIPD on file" value={snapshot.bipd_on_file != null ? `$${Number(snapshot.bipd_on_file).toLocaleString()}` : "—"} />
      <Field label="BIPD required" value={snapshot.bipd_required != null ? `$${Number(snapshot.bipd_required).toLocaleString()}` : "—"} />
      <Field label="MCS-150 outdated" value={snapshot.mcs150_outdated === null ? "—" : snapshot.mcs150_outdated ? "Yes" : "No"} />
      <Field label="Pulled" value={fmtDate(snapshot.fetched_at)} />
    </div>
  );
}

function FlagsPanel({ flags }) {
  if (flags.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No vetting flags raised.</div>;
  }
  const sorted = [...flags].sort((a, b) => (FLAG_SEVERITY_ORDER[a.severity] ?? 9) - (FLAG_SEVERITY_ORDER[b.severity] ?? 9));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sorted.map((f) => (
        <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
          <StatusPill tone={FLAG_SEVERITY_TONE[f.severity] || "neutral"} style={{ flexShrink: 0 }}>{f.severity}</StatusPill>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-body)" }}>{prettifyCode(f.flag_code)}</div>
            {f.detail && <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2 }}>{f.detail}</div>}
            {f.state !== "open" && (
              <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
                {f.state} {f.resolved_by ? `by ${f.resolved_by}` : ""} {f.resolved_at ? `on ${fmtDate(f.resolved_at)}` : ""}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationsPanel({ conversations }) {
  if (conversations.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No activity logged yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {conversations.map((c) => (
        <div key={c.id} style={{ borderLeft: "2px solid var(--clg-border-default)", paddingLeft: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
            {fmtDateTime(c.occurred_at)} · {c.channel} · {c.direction} · {c.author}
          </div>
          <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 2 }}>{c.summary}</div>
          {c.next_step && (
            <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 2 }}>
              Next: {c.next_step}{c.next_step_due ? ` by ${fmtDate(c.next_step_due)}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-navy)", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function LeadDetailModal({ leadId, onClose }) {
  const { lead, snapshot, flags, conversations, loading, error } = useLeadDetail(leadId);

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
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 720,
          boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--clg-text-muted)" }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : error || !lead ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--clg-scarlet)", fontSize: 13 }}>{error || "Lead not found."}</div>
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge tone={SEGMENT_TONES[lead.segment] || "neutral"}>{SEGMENT_LABELS[lead.segment] || lead.segment}</Badge>
                  <StatusPill tone={STATUS_TONES[lead.status] || "neutral"}>{lead.status.replace(/_/g, " ")}</StatusPill>
                </div>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)", marginTop: 6 }}>
                  {lead.legal_name || lead.dba_name || "Unnamed lead"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
                  {[lead.dot_number ? `DOT ${lead.dot_number}` : null, lead.mc_number ? `MC ${lead.mc_number}` : null, [lead.city, lead.state].filter(Boolean).join(", ") || null, lead.sourceLabel].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              <ScoreSummary lead={lead} />

              <Section title="FMCSA snapshot">
                <SnapshotPanel snapshot={snapshot} />
              </Section>

              <Section title="Vetting flags">
                <FlagsPanel flags={flags} />
              </Section>

              <Section title="Activity">
                <ConversationsPanel conversations={conversations} />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
