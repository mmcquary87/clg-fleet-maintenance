import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Card, Badge, Eyebrow, Alert, Input } from "../../ds";
import { useAllWorkOrders } from "../../hooks/useAllWorkOrders";

const STATUS_TABS = ["All", "Needs approval", "Open", "In Progress", "Closed"];

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function severityTone(s) {
  if (s === "Unit down") return "critical";
  if (s === "Urgent") return "brand";
  return "neutral";
}

export default function WorkOrdersView() {
  const { orders, loading, error } = useAllWorkOrders();
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (tab === "All") return true;
        if (tab === "Needs approval") return o.approval_status === "needs_approval";
        return o.status === tab;
      })
      .filter((o) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return [o.unit?.number, o.vendor?.name, o.category, o.description, o.complaint, o.invoice_ref]
          .filter(Boolean).some((v) => v.toLowerCase().includes(q));
      });
  }, [orders, tab, query]);

  const totalCost = filtered.reduce((s, o) => s + (Number(o.cost) || 0), 0);

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Work Orders</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {filtered.length} order{filtered.length === 1 ? "" : "s"}
          </h2>
        </div>
        <div style={{ position: "relative", width: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--clg-cool)" }} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search unit, vendor, category…" style={{ paddingLeft: 30 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 13px", fontSize: 12, cursor: "pointer",
              border: "1px solid " + (tab === t ? "var(--clg-royal)" : "var(--clg-reflection)"),
              background: tab === t ? "var(--clg-royal)" : "#fff",
              color: tab === t ? "#fff" : "var(--clg-pewter)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <Alert tone="critical" title="Couldn't load work orders" style={{ marginBottom: 16 }}>{error}</Alert>}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading work orders…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            No work orders match.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
              <thead>
                <tr>
                  {["Unit", "Category", "Issue", "Severity", "Vendor", "Status", "Opened", "Closed", "Cost"].map((h) => (
                    <th key={h} style={{
                      textAlign: h === "Cost" ? "right" : "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => (
                  <tr key={o.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {o.unit?.number || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{o.category}</td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)", maxWidth: 260, color: "var(--clg-text-muted)" }}>
                      {o.complaint || o.description || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      <Badge tone={severityTone(o.severity)}>{o.severity}</Badge>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>
                      {o.vendor?.name || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {o.approval_status === "needs_approval" ? <Badge tone="critical">Needs approval</Badge> : o.status}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)", fontFamily: "var(--clg-font-mono, monospace)" }}>
                      {o.date_opened || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)", fontFamily: "var(--clg-font-mono, monospace)" }}>
                      {o.date_closed || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)" }}>
                      {money(o.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8} style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>Total</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 700, color: "var(--clg-navy)" }}>
                    {money(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
