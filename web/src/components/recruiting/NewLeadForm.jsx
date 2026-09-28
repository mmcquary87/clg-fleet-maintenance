import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

const SEGMENT_OPTIONS = [
  { value: "driver", label: "Driver" },
  { value: "new_mc", label: "New MC" },
  { value: "small_fleet", label: "Small fleet" },
];

export default function NewLeadForm({ onCancel, onSaved }) {
  const [segment, setSegment] = useState("driver");
  const [legalName, setLegalName] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [dotNumber, setDotNumber] = useState("");
  const [mcNumber, setMcNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!legalName.trim() && !contactName.trim()) {
      setError("Give the lead at least a company name or a contact name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("leads").insert({
      segment,
      source_code: "manual",
      legal_name: legalName.trim() || null,
      dba_name: dbaName.trim() || null,
      dot_number: dotNumber.trim() ? Number(dotNumber.trim()) : null,
      mc_number: mcNumber.trim() || null,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message.includes("duplicate key") ? "A lead with this DOT or MC number already exists." : err.message);
    } else {
      onSaved();
    }
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>New lead</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
          <Field label="Segment" required>
            <Select value={segment} onChange={(e) => setSegment(e.target.value)} options={SEGMENT_OPTIONS} />
          </Field>
          <Field label="DOT number" help="Optional">
            <Input value={dotNumber} onChange={(e) => setDotNumber(e.target.value)} placeholder="e.g. 2516954" />
          </Field>
          <Field label="Legal name" help={segment === "driver" ? "Usually blank for a driver lead" : "Company name"}>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Field>
          <Field label="MC number" help="Optional">
            <Input value={mcNumber} onChange={(e) => setMcNumber(e.target.value)} placeholder="Digits only" />
          </Field>
          <Field label="DBA name" help="Optional">
            <Input value={dbaName} onChange={(e) => setDbaName(e.target.value)} />
          </Field>
          <Field label="Contact name">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. driver or owner's name" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="State">
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. FL" />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="spin" />}
            Save lead
          </Button>
        </div>
      </form>
    </Card>
  );
}
