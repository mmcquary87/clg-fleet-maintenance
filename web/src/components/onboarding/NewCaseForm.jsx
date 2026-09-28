import { useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Select, Input, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { useOnboardingFormOptions } from "../../hooks/useOnboardingFormOptions";

const PATHWAY_OPTIONS = [
  { value: "lease_on", label: "Lease-on (owner-operator)" },
  { value: "company_driver", label: "Company driver" },
  { value: "brokerage_carrier", label: "Brokerage carrier" },
];

export default function NewCaseForm({ onCancel, onSaved }) {
  const { templates, accounts, contacts, loading } = useOnboardingFormOptions();
  const [pathway, setPathway] = useState("lease_on");
  const [templateId, setTemplateId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [targetStart, setTargetStart] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const templatesForPathway = useMemo(
    () => templates.filter((t) => t.pathway === pathway),
    [templates, pathway],
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!templateId) { setError("Pick a template."); return; }
    if (!accountId && !contactId) { setError("Pick an account or a contact -- a case needs at least one."); return; }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("onboarding_cases").insert({
      pathway,
      template_id: templateId,
      account_id: accountId || null,
      contact_id: contactId || null,
      target_start: targetStart || null,
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
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>New onboarding case</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20, color: "var(--clg-text-muted)" }}>
          <Loader2 size={16} className="spin" />
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
            <Field label="Pathway" required>
              <Select value={pathway} onChange={(e) => { setPathway(e.target.value); setTemplateId(""); }} options={PATHWAY_OPTIONS} />
            </Field>
            <Field label="Template" required help={templatesForPathway.length === 0 ? "No templates for this pathway yet." : "A draft template can be picked, but the case can't clear until it's approved."}>
              <Select
                value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                placeholder="Choose a template"
                options={templatesForPathway.map((t) => ({ value: t.id, label: "v" + t.version + " (" + t.status + ")" }))}
              />
            </Field>
            <Field label="Account" help={accounts.length === 0 ? "No accounts yet." : "Optional if a contact is picked"}>
              <Select
                value={accountId} onChange={(e) => setAccountId(e.target.value)}
                placeholder="No account"
                options={accounts.map((a) => ({ value: a.id, label: a.legal_name || a.dba_name || a.id }))}
              />
            </Field>
            <Field label="Contact" help={contacts.length === 0 ? "No contacts yet." : "Optional if an account is picked"}>
              <Select
                value={contactId} onChange={(e) => setContactId(e.target.value)}
                placeholder="No contact"
                options={contacts.map((c) => ({ value: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.id }))}
              />
            </Field>
            <Field label="Target start" help="Optional">
              <Input type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value)} />
            </Field>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 size={14} className="spin" />}
              Create case
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
