import { Loader2, Download, UserMinus } from "lucide-react";
import { Card, Badge, Button, Alert } from "../ds";
import { useDeductions } from "../hooks/useDeductions";
import { downloadCsv } from "../lib/exportCsv";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

const EXPORT_COLUMNS = [
  { label: "Driver", value: (r) => r.chargeback_driver_name },
  { label: "Unit", value: (r) => r.unit?.number },
  { label: "Date", value: (r) => r.date_opened },
  { label: "Vendor", value: (r) => r.vendor?.name },
  { label: "Category", value: (r) => r.category },
  { label: "Description", value: (r) => r.complaint || r.description },
  { label: "Invoice / ref #", value: (r) => r.invoice_ref },
  { label: "PO number", value: (r) => r.po_number },
  { label: "Amount", value: (r) => Number(r.cost) || 0 },
];

export default function DeductionsView({ range }) {
  const { records, loading, error } = useDeductions(range);
  const total = records.reduce((s, r) => s + (Number(r.cost) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>
          {records.length} deduction{records.length === 1 ? "" : "s"} · {money(total)} total
        </div>
        <Button
          variant="outline" size="sm" iconLeft={<Download size={14} />}
          onClick={() => downloadCsv(`driver-deductions-${new Date().toISOString().slice(0, 10)}.csv`, records, EXPORT_COLUMNS)}
          disabled={records.length === 0}
        >
          Export CSV
        </Button>
      </div>

      {error && <Alert tone="critical" title="Couldn't load deductions" style={{ marginBottom: 16 }}>{error}</Alert>}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading deductions…
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <UserMinus size={22} strokeWidth={1.5} color="var(--clg-cool)" />
            No driver chargebacks in this range. Mark a service "Charge back to driver" on Log Invoice to have it show up here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
              <thead>
                <tr>
                  {["Driver", "Unit", "Date", "Vendor", "Category", "Description", "Amount"].map((h) => (
                    <th key={h} style={{
                      textAlign: h === "Amount" ? "right" : "left", padding: "10px 14px", fontFamily: "var(--clg-font-heading)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {r.chargeback_driver_name || <Badge tone="critical">Driver not named</Badge>}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {r.unit?.number || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {r.date_opened || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {r.vendor?.name || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r.category}</td>
                    <td style={{ padding: "10px 14px", color: "var(--clg-text-muted)", maxWidth: 260, borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {r.complaint || r.description || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      {money(r.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>Total</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 700, color: "var(--clg-navy)" }}>
                    {money(total)}
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
