import { useState } from "react";
import { ArrowLeft, Loader2, ShieldOff } from "lucide-react";
import { StatusPill, Button, Alert, Card } from "../../../ds";
import { useContactDetail } from "../../../hooks/useContactDetail";
import { supabase } from "../../../lib/supabaseClient";

export default function ContactRecordView({ contactId, onBack, onOpenAccount, onOpenCampaign }) {
  const { contact, account, campaignMemberships, loading, error, reload } = useContactDetail(contactId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const markDoNotContact = async () => {
    setBusy(true);
    setActionError(null);
    const { error: err } = await supabase.from("contacts").update({ do_not_contact: true }).eq("id", contactId);
    setBusy(false);
    if (err) setActionError(err.message); else reload();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-text-muted)" }}><Loader2 size={18} className="spin" /></div>;
  if (error || !contact) return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-scarlet)" }}>{error || "Contact not found."}</div>;

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 800, margin: "0 auto" }}>
      <button type="button" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", fontSize: 13, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Contacts
      </button>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 20, color: "var(--clg-navy)" }}>
          {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed contact"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
          {contact.role.replace(/_/g, " ")}
          {account && (
            <> · <button type="button" onClick={() => onOpenAccount(account.id)} style={{ background: "none", border: "none", color: "var(--clg-royal)", cursor: "pointer", fontSize: 12.5, padding: 0, textDecoration: "underline" }}>{account.legal_name || account.dba_name}</button></>
          )}
        </div>

        {actionError && <Alert tone="critical" style={{ marginTop: 12 }}>{actionError}</Alert>}

        {contact.do_not_contact ? (
          <Card tone="default" style={{ marginTop: 14, borderTop: "3px solid var(--clg-scarlet)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--clg-scarlet)", fontSize: 13 }}>
              <ShieldOff size={14} /> Do not contact
            </div>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
              Phone and email are withheld everywhere in this app for this contact.
            </div>
          </Card>
        ) : (
          <>
            <div style={{ fontSize: 13, marginTop: 14 }}>
              {[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone or email on file"}
            </div>
            <Button variant="quiet" size="sm" iconLeft={<ShieldOff size={12} />} disabled={busy} onClick={markDoNotContact} style={{ marginTop: 12 }}>
              Mark do not contact
            </Button>
          </>
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
  );
}
