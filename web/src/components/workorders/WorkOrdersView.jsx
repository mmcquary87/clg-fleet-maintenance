import { useMemo, useState } from "react";
import { Loader2, Search, Download } from "lucide-react";
import { Card, Badge, Eyebrow, Alert, Input, Button, Select } from "../../ds";
import { useAllWorkOrders } from "../../hooks/useAllWorkOrders";
import { downloadCsv } from "../../lib/exportCsv";
import { CATEGORIES } from "../../lib/categories";
import DateRangeFilter from "../DateRangeFilter";
import WorkOrderDetailModal from "./WorkOrderDetailModal";

const EXPORT_COLUMNS = [
  { label: "WO #", value: (o) => o.wo_number },
  { label: "Unit", value: (o) => o.unit?.number },
  { label: "Category", value: (o) => o.category },
  { label: "Severity", value: (o) => o.severity },
  { label: "Issue", value: (o) => o.complaint || o.description },
  { label: "Vendor", value: (o) => o.vendor?.name },
  { label: "Status", value: (o) => o.status },
  { label: "Date opened", value: (o) => o.date_opened },
  { label: "Date closed", value: (o) => o.date_closed },
  { label: "Cost", value: (o) => Number(o.cost) || 0 },
  { label: "Invoice / ref #", value: (o) => o.invoice_ref },
  { label: "PO number", value: (o) => o.po_number },
  { label: "Chargeback", value: (o) => (o.is_chargeback ? "Yes" : "No") },
  { label: "Chargeback driver", value: (o) => o.chargeback_driver_name },
];

const STATUS_TABS = ["All", "Needs approval", "Open", "In Progress", "Closed"];

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function severityTone(s) {
  if (s === "Unit down") return "critical";
  if (s === "Urgent") return "brand";
  return "neutral";
}

// Whole days only -- date_opened/date_closed are dates, not timestamps, so
// there's no honest way to show hours the way a live "2d 4h" clock would.
function daysBetween(startStr, endStr) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  return Math.max(0, Math.round((end - start) / 86400000));
}

function ageDays(o) {
  if (!o.date_opened) return null;
  if (o.status === "Closed") return o.date_closed ? daysBetween(o.date_opened, o.date_closed) : null;
  return daysBetween(o.date_opened, new Date().toISOString().slice(0, 10));
}

export default function WorkOrdersView({ initialCategory }) {
  const [range, setRange] = useState(null);
  const { orders, loading, error, reload } = useAllWorkOrders(range);
  const [tab, setTab] = useState("All");
  const [category, setCategory] = useState(initialCategory || "All");
  const [unit, setUnit] = useState("All");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const unitOptions = useMemo(() => {
    return ["All", ...Array.from(new Set(orders.map((o) => o.unit?.number).filter(Boolean))).sort()];
  }, [orders]);

  const tabCounts = useMemo(() => ({
    All: orders.length,
    "Needs approval": orders.filter((o) => o.approval_status === "needs_approval").length,
    Open: orders.filter((o) => o.status === "Open").length,
    "In Progress": orders.filter((o) => o.status === "In Progress").length,
    Closed: orders.filter((o) => o.status === "Closed").length,
  }), [orders]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (tab === "All") return true;
        if (tab === "Needs approval") return o.approval_status === "needs_approval";
        return o.status === tab;
      })
      .filter((o) => category === "All" || o.category === category)
      .filter((o) => unit === "All" || o.unit?.number === unit)
      .filter((o) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return [o.wo_number, o.unit?.number, o.vendor?.name, o.category, o.description, o.complaint, o.invoice_ref]
          .filter(Boolean).some((v) => v.toLowerCase().includes(q));
      })
      // Who's blocking it first (needs your approval), then oldest/longest-
      // open first within each group -- the more urgent read for an open
      // list than the hook's default newest-first ordering.
      .sort((a, b) => {
        const aBlocked = a.approval_status === "needs_approval" ? 0 : 1;
        const bBlocked = b.approval_status === "needs_approval" ? 0 : 1;
        if (aBlocked !== bBlocked) return aBlocked - bBlocked;
        const aOpen = a.status !== "Closed" ? 0 : 1;
        const bOpen = b.status !== "Closed" ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return (ageDays(b) ?? 0) - (ageDays(a) ?? 0);
      });
  }, [orders, tab, category, unit, query]);

  const totalCost = filtered.reduce((s, o) => s + (Number(o.cost) || 0), 0);
  const openCount = tabCounts.Open + tabCounts["In Progress"];
  const openNoCostCount = orders.filter((o) => o.status !== "Closed" && !o.cost).length;

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Work Orders</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {filtered.length} order{filtered.length === 1 ? "" : "s"}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
            {openCount} open, {tabCounts.Closed} closed. Open items are sorted by who's blocking them, then by age.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", width: 260 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--clg-cool)" }} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search unit, vendor, category…" style={{ paddingLeft: 30 }} />
          </div>
          <div style={{ width: 130 }}>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)} options={unitOptions} />
          </div>
          <Button
            variant="outline" size="sm" iconLeft={<Download size={14} />}
            onClick={() => downloadCsv(`work-orders-${new Date().toISOString().slice(0, 10)}.csv`, filtered, EXPORT_COLUMNS)}
            disabled={filtered.length === 0}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <DateRangeFilter onChange={setRange} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 14px", fontSize: 12.5, cursor: "pointer", borderRadius: "var(--clg-radius-pill)",
              border: "1px solid " + (tab === t ? "var(--clg-navy)" : "var(--clg-reflection)"),
              background: tab === t ? "var(--clg-navy)" : "#fff",
              color: tab === t ? "#fff" : "var(--clg-pewter)",
              boxShadow: tab === t ? "none" : "var(--clg-shadow-resting)",
            }}
          >
            {t} · {tabCounts[t]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              padding: "6px 12px", fontSize: 11.5, cursor: "pointer",
              border: "1px solid " + (category === c ? "var(--clg-royal)" : "var(--clg-reflection)"),
              background: category === c ? "var(--clg-royal)" : "#fff",
              color: category === c ? "#fff" : "var(--clg-pewter)",
            }}
          >
            {c}
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
                  {["WO #", "Unit", "Category", "Issue", "Severity", "Vendor", "Status", "Opened", "Closed", "Cost", "Age"].map((h) => (
                    <th key={h} style={{
                      textAlign: h === "Cost" || h === "Age" ? "right" : "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => (
                  <tr
                    key={o.id}
                    onClick={() => setOpenId(o.id)}
                    style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>
                      {o.wo_number || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {o.unit?.number || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {o.category}
                      {o.is_chargeback && <Badge tone="critical" style={{ marginLeft: 6 }}>Chargeback</Badge>}
                    </td>
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
                    <td style={{
                      padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)", textAlign: "right",
                      fontFamily: "var(--clg-font-heading)", fontWeight: 700,
                      color: o.status !== "Closed" ? "var(--clg-scarlet)" : "var(--clg-text-muted)",
                    }}>
                      {ageDays(o) != null ? `${ageDays(o)}d` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9} style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>Total</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 700, color: "var(--clg-navy)" }}>
                    {money(totalCost)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {openNoCostCount > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 14, lineHeight: 1.6, maxWidth: 760 }}>
          {openNoCostCount} of {openCount} open item{openCount === 1 ? "" : "s"} {openNoCostCount === 1 ? "has" : "have"} no cost on file yet — nothing to price the delay against until a vendor sends one.
        </div>
      )}

      {openId && (
        <WorkOrderDetailModal
          workOrderId={openId}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
