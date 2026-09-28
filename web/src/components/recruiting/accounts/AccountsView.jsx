import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge, Select, Alert, Eyebrow } from "../../../ds";
import { useAccounts } from "../../../hooks/useAccounts";

const TYPE_LABELS = { owner_operator: "Owner-operator", small_fleet: "Small fleet", brokerage_carrier: "Brokerage carrier", individual: "Individual" };
const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "owner_operator", label: "Owner-operator" },
  { value: "small_fleet", label: "Small fleet" },
  { value: "brokerage_carrier", label: "Brokerage carrier" },
  { value: "individual", label: "Individual" },
];

export default function AccountsView({ onOpenAccount }) {
  const { accounts, loading, error } = useAccounts();
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => accounts.filter((a) => !typeFilter || a.account_type === typeFilter), [accounts, typeFilter]);

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Recruiting</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </h2>
        </div>
        {accounts.length > 0 && (
          <div style={{ width: 190 }}>
            <Select options={TYPE_OPTIONS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
          </div>
        )}
      </div>

      {error && <Alert tone="critical" title="Couldn't load accounts" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading accounts…
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No accounts yet. Convert a lead (from its detail view) to create one.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No accounts match this filter.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
            <thead>
              <tr>
                {["Name", "Type", "DOT/MC", "Location", "Contacts", "Cases", "Owner"].map((label) => (
                  <th key={label} style={{
                    textAlign: "left", padding: "10px 12px", fontFamily: "var(--clg-font-heading)",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                  }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={a.id} onClick={() => onOpenAccount(a.id)} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", fontWeight: 600, color: "var(--clg-navy)" }}>{a.legal_name || a.dba_name}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}><Badge tone="neutral">{TYPE_LABELS[a.account_type] || a.account_type}</Badge></td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>
                    {[a.dot_number ? "DOT " + a.dot_number : null, a.mc_number ? "MC " + a.mc_number : null].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>{[a.city, a.state].filter(Boolean).join(", ") || "—"}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{a.contactCount}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{a.caseCount}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>{a.ownerName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
