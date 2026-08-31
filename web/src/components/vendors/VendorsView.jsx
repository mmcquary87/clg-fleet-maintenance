import { useState } from "react";
import { Plus, Loader2, Pencil } from "lucide-react";
import { Button, Badge, Eyebrow, Alert } from "../../ds";
import { useVendors } from "../../hooks/useVendors";
import { useVendorActivity } from "../../hooks/useVendorActivity";
import VendorForm from "./VendorForm";

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}

function VendorCard({ vendor, activity, onEdit }) {
  const jobsYtd = activity?.jobsYtd ?? 0;
  const spendYtd = activity?.spendYtd ?? 0;
  const avgTicket = jobsYtd > 0 ? spendYtd / jobsYtd : 0;
  const holding = activity?.holding ?? [];

  const contactLine = [vendor.contact_name, vendor.phone || vendor.contact, vendor.contact_email].filter(Boolean).join(" · ");

  return (
    <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 22, position: "relative" }}>
      <button
        onClick={onEdit} title="Edit vendor"
        style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}
      >
        <Pencil size={14} />
      </button>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingRight: 24, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)" }}>{vendor.name}</span>
        {vendor.specialty_category && <Badge tone="neutral">{vendor.specialty_category}</Badge>}
      </div>

      <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 10, lineHeight: 1.55 }}>
        {holding.length > 0
          ? `Holding Unit${holding.length > 1 ? "s" : ""} ${holding.map((h) => h.unit).join(", ")} since ${fmtDate(holding[0].since)}.`
          : jobsYtd > 0
            ? `${jobsYtd} job${jobsYtd === 1 ? "" : "s"} this year, no open work right now.`
            : "No jobs logged yet."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--clg-border-subtle)" }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Jobs YTD</div>
          <div style={{ fontSize: 13, color: "var(--clg-navy)", fontWeight: 600, marginTop: 3 }}>{jobsYtd}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Spend YTD</div>
          <div style={{ fontSize: 13, color: "var(--clg-navy)", fontWeight: 600, marginTop: 3 }}>{fmtMoney(spendYtd)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Avg ticket</div>
          <div style={{ fontSize: 13, color: "var(--clg-navy)", fontWeight: 600, marginTop: 3 }}>{jobsYtd > 0 ? fmtMoney(avgTicket) : "—"}</div>
        </div>
      </div>

      {contactLine && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)", fontSize: 12, color: "var(--clg-text-muted)" }}>
          {contactLine}
        </div>
      )}
    </div>
  );
}

export default function VendorsView() {
  const { vendors, loading, error, reload } = useVendors();
  const { byVendorId, loading: activityLoading } = useVendorActivity();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const holdingCount = vendors.filter((v) => (byVendorId[v.id]?.holding.length ?? 0) > 0).length;

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Vendors</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {vendors.length} vendor{vendors.length === 1 ? "" : "s"} in use
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
            {holdingCount > 0
              ? `${holdingCount} currently holding a unit of yours.`
              : "None currently holding a unit."}
          </p>
        </div>
        <Button size="sm" iconLeft={<Plus size={16} />} onClick={() => { setShowForm(true); setEditing(null); }}>New vendor</Button>
      </div>

      {showForm && !editing && (
        <VendorForm
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}

      {editing && (
        <VendorForm
          vendor={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {error && (
        <Alert tone="critical" title="Couldn't load vendors" style={{ marginBottom: 16 }}>{error}</Alert>
      )}

      {loading || activityLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading vendors…
        </div>
      ) : vendors.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No vendors yet. Add the shops you use so work orders can be attributed to them.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {vendors.map((v) => (
            <VendorCard
              key={v.id} vendor={v} activity={byVendorId[v.id]}
              onEdit={() => { setEditing(v); setShowForm(false); }}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: "18px 22px", maxWidth: 680 }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-navy)" }}>
          What this page is for
        </div>
        <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 10, lineHeight: 1.6 }}>
          Not a directory — a scoreboard. Spend and job counts are year-to-date; "holding" means a vendor currently has an open work order for one of your units. Everything below that line is contact detail.
        </div>
      </div>
    </div>
  );
}
