import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusPill, Select, Alert, Eyebrow } from "../../../ds";
import { useContacts } from "../../../hooks/useContacts";

const FILTER_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "contactable", label: "Contactable" },
  { value: "do_not_contact", label: "Do not contact" },
];

export default function ContactsView({ onOpenContact }) {
  const { contacts, loading, error } = useContacts();
  const [filter, setFilter] = useState("everyone");

  const filtered = useMemo(() => contacts.filter((c) => {
    if (filter === "contactable") return !c.do_not_contact;
    if (filter === "do_not_contact") return c.do_not_contact;
    return true;
  }), [contacts, filter]);

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Recruiting</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {filtered.length} contact{filtered.length === 1 ? "" : "s"}
          </h2>
        </div>
        <div style={{ width: 170 }}>
          <Select options={FILTER_OPTIONS} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      </div>

      {error && <Alert tone="critical" title="Couldn't load contacts" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading contacts…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No contacts match this filter.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
            <thead>
              <tr>
                {["Name", "Account", "Role", "Phone / email", ""].map((label) => (
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
              {filtered.map((c, i) => (
                <tr key={c.id} onClick={() => onOpenContact(c.id)} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", fontWeight: 600, color: "var(--clg-navy)" }}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>{c.accountName || "—"}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>{c.role.replace(/_/g, " ")}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>
                    {c.do_not_contact ? "—" : [c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    {c.do_not_contact && <StatusPill tone="red">Do not contact</StatusPill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
