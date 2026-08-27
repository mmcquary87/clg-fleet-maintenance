import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button, Card, Table, Eyebrow, Alert } from "../../ds";
import { useVendors } from "../../hooks/useVendors";
import VendorForm from "./VendorForm";

export default function VendorsView() {
  const { vendors, loading, error, reload } = useVendors();
  const [showForm, setShowForm] = useState(false);

  const rows = vendors.map((v) => ({
    name: v.name,
    specialty_category: v.specialty_category || "—",
    contact_name: v.contact_name || "—",
    contact_email: v.contact_email || "—",
    contact: v.contact || "—",
    created_at: new Date(v.created_at).toLocaleDateString(),
  }));

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <Eyebrow tone="brand">Vendors</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Approved repair shops</h2>
        </div>
        <Button size="sm" iconLeft={<Plus size={16} />} onClick={() => setShowForm(true)}>New vendor</Button>
      </div>

      {showForm && (
        <VendorForm
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}

      {error && (
        <Alert tone="critical" title="Couldn't load vendors" style={{ marginBottom: 16 }}>{error}</Alert>
      )}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading vendors…
          </div>
        ) : vendors.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            No vendors yet. Add the shops you use so work orders can be attributed to them.
          </div>
        ) : (
          <Table
            columns={[
              { key: "name", label: "Vendor" },
              { key: "specialty_category", label: "Specialty" },
              { key: "contact_name", label: "Contact" },
              { key: "contact_email", label: "Email" },
              { key: "contact", label: "Phone / other" },
              { key: "created_at", label: "Added" },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </div>
  );
}
