import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

export default function UnitForm({ onCancel, onSaved }) {
  const [number, setNumber] = useState("");
  const [type, setType] = useState("Truck");
  const [vin, setVin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("units").insert({
      number: number.trim(),
      type,
      vin: vin.trim() || null,
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
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>New unit</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
          <Field label="Unit number" required>
            <Input required value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 3303" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)} options={["Truck", "Trailer", "Van", "Other"]} />
          </Field>
          <Field label="VIN" help="Optional">
            <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Vehicle ID number" />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="spin" />}
            Save unit
          </Button>
        </div>
      </form>
    </Card>
  );
}
