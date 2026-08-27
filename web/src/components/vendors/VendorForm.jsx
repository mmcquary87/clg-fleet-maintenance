import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { CATEGORIES } from "../../lib/categories";

export default function VendorForm({ onCancel, onSaved }) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("vendors").insert({
      name: name.trim(),
      specialty_category: specialty || null,
      contact: contact.trim() || null,
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
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>New vendor</h3>
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
          <Field label="Contact" style={{ gridColumn: "1 / -1" }}>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="spin" />}
            Save vendor
          </Button>
        </div>
      </form>
    </Card>
  );
}
