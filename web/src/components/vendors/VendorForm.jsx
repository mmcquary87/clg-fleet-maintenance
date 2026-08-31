import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { CATEGORIES } from "../../lib/categories";

export default function VendorForm({ vendor, onCancel, onSaved }) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [specialty, setSpecialty] = useState(vendor?.specialty_category ?? "");
  const [contactName, setContactName] = useState(vendor?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(vendor?.contact_email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [address, setAddress] = useState(vendor?.address ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fields = {
      name: name.trim(),
      specialty_category: specialty || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };
    const { error: err } = vendor
      ? await supabase.from("vendors").update(fields).eq("id", vendor.id)
      : await supabase.from("vendors").insert(fields);
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
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>{vendor ? "Edit vendor" : "New vendor"}</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 20 }}>
          <Field label="Vendor name" required>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rush Truck Center" />
          </Field>
          <Field label="Specialty" help="Optional — helps with vendor spend breakdowns">
            <Select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="No specialty"
              options={CATEGORIES}
            />
          </Field>
          <Field label="Contact name" help="Optional — who to address the email to">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Dana at the front desk" />
          </Field>
          <Field label="Contact email" help="Optional — enables the notify-shop email">
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="shop@example.com" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0100" />
          </Field>
          <Field label="Address">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, State" />
          </Field>
          <Field label="Notes" help="Account #, terms, anything worth remembering" style={{ gridColumn: "1 / -1" }}>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              style={{
                width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: "var(--clg-size-body)",
                color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
                borderRadius: "var(--clg-radius-sm)", padding: "11px 12px", resize: "vertical",
              }}
            />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="spin" />}
            {vendor ? "Save changes" : "Save vendor"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
