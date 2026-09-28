import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge, StatusPill, Card } from "../../../ds";
import { useAccountDetail } from "../../../hooks/useAccountDetail";
import LeadDetailModal from "../LeadDetailModal";
import OnboardingCaseModal from "../../onboarding/OnboardingCaseModal";

const TYPE_LABELS = { owner_operator: "Owner-operator", small_fleet: "Small fleet", brokerage_carrier: "Brokerage carrier", individual: "Individual" };
const PATHWAY_LABELS = { company_driver: "Company driver", lease_on: "Lease-on", brokerage_carrier: "Brokerage carrier" };
const CASE_STATUS_TONES = { cleared: "green", withdrawn: "red", rejected: "red", on_hold: "neutral", open: "brand" };

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default function AccountRecordView({ accountId, onBack, onOpenCampaign }) {
  const { account, originatingLead, contacts, cases, campaignMemberships, loading, error, reload } = useAccountDetail(accountId);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-text-muted)" }}><Loader2 size={18} className="spin" /></div>;
  if (error || !account) return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-scarlet)" }}>{error || "Account not found."}</div>;

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1000, margin: "0 auto" }}>
      <button type="button" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", fontSize: 13, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Accounts
      </button>

      <Card style={{ marginBottom: 20 }}>
        <Badge tone="neutral">{TYPE_LABELS[account.account_type] || account.account_type}</Badge>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 20, color: "var(--clg-navy)", marginTop: 8 }}>
          {account.legal_name}{account.dba_name && account.dba_name !== account.legal_name ? " (" + account.dba_name + ")" : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
          {[account.dot_number ? "DOT " + account.dot_number : null, account.mc_number ? "MC " + account.mc_number : null, [account.city, account.state].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ") || "No DOT/MC/location on file"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 8 }}>
          {originatingLead ? (
            <>Created from <button type="button" onClick={() => setSelectedLeadId(originatingLead.id)} style={{ background: "none", border: "none", color: "var(--clg-royal)", cursor: "pointer", fontSize: 12.5, padding: 0, textDecoration: "underline" }}>{originatingLead.legal_name || originatingLead.dba_name || "this lead"}</button></>
          ) : (
            "No originating lead on file"
          )}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <Card>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 12 }}>Contacts</div>
          {contacts.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No contacts yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {contacts.map((c) => (
                <div key={c.id} style={{ padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</div>
                  <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
                    {c.role.replace(/_/g, " ")}{c.do_not_contact ? " · Do not contact" : (c.phone || c.email ? " · " + (c.phone || c.email) : "")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 12 }}>Onboarding cases</div>
          {cases.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No onboarding cases yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cases.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelectedCaseId(c.id)} style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", border: "none", cursor: "pointer" }}>
                  <span style={{ fontSize: 13 }}>{PATHWAY_LABELS[c.pathway] || c.pathway} — {fmtDate(c.opened_at)}</span>
                  <StatusPill tone={CASE_STATUS_TONES[c.status] || "neutral"}>{c.status.replace(/_/g, " ")}</StatusPill>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 12 }}>Campaign memberships</div>
          {campaignMemberships.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>Not in any campaigns.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {campaignMemberships.map((m) => (
                <button key={m.id} type="button" onClick={() => onOpenCampaign(m.campaigns.id)} style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", border: "none", cursor: "pointer" }}>
                  <span style={{ fontSize: 13 }}>{m.campaigns?.name}{m.tier ? " (Tier " + m.tier + ")" : ""}</span>
                  <StatusPill tone="neutral">{m.status.replace(/_/g, " ")}</StatusPill>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {selectedLeadId && <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onLeadChanged={reload} />}
      {selectedCaseId && <OnboardingCaseModal caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} onCaseChanged={reload} />}
    </div>
  );
}
