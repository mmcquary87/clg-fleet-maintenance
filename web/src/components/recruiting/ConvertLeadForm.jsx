import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "owner_operator", label: "Owner-operator" },
  { value: "small_fleet", label: "Small fleet" },
  { value: "brokerage_carrier", label: "Brokerage carrier" },
  { value: "individual", label: "Individual" },
];
const CONTACT_ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "owner_driver", label: "Owner-driver" },
  { value: "driver", label: "Driver" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "office", label: "Office" },
  { value: "other", label: "Other" },
];
const DEFAULT_ACCOUNT_TYPE = { driver: "individual", new_mc: "owner_operator", small_fleet: "small_fleet" };
const DEFAULT_CONTACT_ROLE = { driver: "driver", new_mc: "owner", small_fleet: "owner" };

function splitName(name) {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ConvertLeadForm({ lead, onCancel, onConverted }) {
  const { first, last } = splitName(lead.contact_name);
  const [createAccount, setCreateAccount] = useState(lead.segment !== "driver");
  const [accountType, setAccountType] = useState(DEFAULT_ACCOUNT_TYPE[lead.segment] || "individual");
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(last);
  const [role, setRole] = useState(DEFAULT_CONTACT_ROLE[lead.segment] || "other");
  const [phone, setPhone] = useState(lead.phone || "");
  const [email, setEmail] = useState(lead.email || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim() && !phone.trim()) {
      setError("Give the contact at least a name or a phone number.");
      return;
    }
    setSubmitting(true);
    setError(null);

    let accountId = null;
    if (createAccount) {
      const { data: account, error: accErr } = await supabase.from("accounts").insert({
        account_type: accountType,
        legal_name: lead.legal_name || lead.dba_name || firstName + " " + lastName,
        dba_name: lead.dba_name,
        dot_number: lead.dot_number,
        mc_number: lead.mc_number,
        city: lead.city,
        state: lead.state,
        owner_id: lead.owner_id,
        converted_from_lead_id: lead.id,
        latest_snapshot_id: lead.latest_snapshot_id,
      }).select("id").single();
      if (accErr) {
        setSubmitting(false);
        setError(accErr.message.includes("duplicate key") ? "An account already exists for this DOT/MC number." : accErr.message);
        return;
      }
      accountId = account.id;
    }

    const { data: contact, error: contactErr } = await supabase.from("contacts").insert({
      account_id: accountId,
      lead_id: lead.id,
      role,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      owner_id: lead.owner_id,
    }).select("id").single();
    if (contactErr) {
      setSubmitting(false);
      setError(contactErr.message);
      return;
    }

    const { error: updErr } = await supabase.from("leads").update({
      converted_at: new Date().toISOString(),
      converted_account_id: accountId,
      converted_contact_id: contact.id,
    }).eq("id", lead.id);
    setSubmitting(false);
    if (updErr) { setError(updErr.message); return; }
    onConverted();
  };

  return (
    <form onSubmit={onSubmit} style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 16, marginTop: 10 }}>
      {error && <Alert tone="critical" style={{ marginBottom: 12 }}>{error}</Alert>}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
        <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} />
        Create an account for this company
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 16 }}>
        {createAccount && (
          <Field label="Account type" style={{ gridColumn: "1 / -1" }}>
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value)} options={ACCOUNT_TYPE_OPTIONS} />
          </Field>
        )}
        <Field label="First name">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Contact role">
          <Select value={role} onChange={(e) => setRole(e.target.value)} options={CONTACT_ROLE_OPTIONS} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email" style={{ gridColumn: "1 / -1" }}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting && <Loader2 size={14} className="spin" />}
          Convert
        </Button>
      </div>
    </form>
  );
}
