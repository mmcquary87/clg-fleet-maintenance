import { useEffect, useState } from "react";
import { X, Loader2, FileDown } from "lucide-react";
import { Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { downloadCsv } from "../../lib/exportCsv";
import { buildIntacctBillRows, INTACCT_EXPORT_CSV_COLUMNS } from "../../lib/intacctExport";
import DateRangeFilter from "../DateRangeFilter";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

const GL_FIELDS = [
  "truck_inspection_account", "truck_tires_account", "truck_repairs_company_account",
  "truck_repairs_owner_operator_account", "truck_parts_account", "trailer_inspection_account",
  "trailer_tires_account", "trailer_repairs_account", "trailer_parts_account",
];

// Sage Intacct AP Bills export -- see intacctExport.js for the full
// eligibility/GL-routing logic and DESIGN_QUEUE.md's "Sage Intacct
// integration" item for the design. Closed, non-voided work orders that
// haven't been exported before, filtered by date_closed. A work order
// with no vendor attached at all (a pure in-house job) is always
// skipped -- Intacct requires a real vendor on every bill, and an
// employee's labor is wages, not an AP payable.
export default function IntacctExportModal({ onClose }) {
  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportedCount, setExportedCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExportedCount(null);

    (async () => {
      let query = supabase.from("work_orders")
        .select(
          "id, wo_number, category, cost, date_closed, invoice_ref, complaint, description, " +
          "vendor:vendors(id, name, intacct_vendor_id), unit:units(type, owner_operator_assigned), " +
          "parts:work_order_parts(quantity, unit_cost)"
        )
        .eq("status", "Closed")
        .eq("voided", false)
        .is("exported_to_intacct_at", null)
        .order("date_closed", { ascending: true });
      if (range?.start) query = query.gte("date_closed", range.start);
      if (range?.end) query = query.lte("date_closed", range.end);

      const [ordersRes, glRes, settingsRes] = await Promise.all([
        query,
        supabase.from("gl_account_map").select(GL_FIELDS.join(", ")).single(),
        supabase.from("app_settings").select("default_payment_terms").single(),
      ]);
      if (cancelled) return;
      if (ordersRes.error) {
        setError(ordersRes.error.message);
        setLoading(false);
        return;
      }

      const glMap = glRes.data ?? {};
      const batchTitle = `CLG Fleet Maintenance ${new Date().toISOString().slice(0, 10)}`;
      const { eligible: e, skipped: s } = buildIntacctBillRows(ordersRes.data ?? [], {
        glMap, defaultTerms: settingsRes.data?.default_payment_terms, batchTitle,
      });
      setEligible(e);
      setSkipped(s);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  const totalAmount = eligible.reduce((s, { row }) => s + (Number(row.AMOUNT) || 0), 0);

  const runExport = async () => {
    setExporting(true);
    setError(null);
    try {
      downloadCsv(
        `intacct-ap-bills-${new Date().toISOString().slice(0, 10)}.csv`,
        eligible.map((e) => e.row),
        INTACCT_EXPORT_CSV_COLUMNS
      );
      const ids = [...new Set(eligible.map((e) => e.order.id))];
      const { error: updateErr } = await supabase.from("work_orders")
        .update({ exported_to_intacct_at: new Date().toISOString() })
        .in("id", ids);
      if (updateErr) throw updateErr;
      setExportedCount(ids.length);
      setEligible([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 760,
          maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700, color: "var(--clg-navy)" }}>Export to Sage Intacct</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 14 }}>
            Closed work orders with a real vendor invoice that haven't been exported before. Filters by date closed.
            In-house jobs (no vendor attached) are always excluded — their labor is wages, not an AP bill.
          </p>
          <DateRangeFilter onChange={setRange} />

          {exportedCount != null && (
            <Alert tone="brand" title="Exported" style={{ marginTop: 16 }}>
              {exportedCount} work order{exportedCount === 1 ? "" : "s"} downloaded and marked as exported — they won't show up in a future export.
            </Alert>
          )}
          {error && <Alert tone="critical" title="Couldn't export" style={{ marginTop: 16 }}>{error}</Alert>}

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "30px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
              <Loader2 size={16} className="spin" /> Checking eligible work orders…
            </div>
          ) : (
            <>
              <div style={{ marginTop: 16, display: "flex", gap: 28 }}>
                <div>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--clg-text-muted)" }}>Ready to export</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--clg-navy)" }}>{eligible.length} line{eligible.length === 1 ? "" : "s"} · {money(totalAmount)}</div>
                </div>
                {skipped.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--clg-scarlet)" }}>Skipped</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--clg-scarlet)" }}>{skipped.length}</div>
                  </div>
                )}
              </div>

              {skipped.length > 0 && (
                <div style={{ marginTop: 14, background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 12, maxHeight: 160, overflowY: "auto" }}>
                  {skipped.map(({ order, reason }) => (
                    <div key={order.id} style={{ fontSize: 12, color: "var(--clg-text-body)", padding: "4px 0" }}>
                      WO {order.wo_number || order.id} — {reason}
                    </div>
                  ))}
                </div>
              )}

              {eligible.length > 0 && (
                <div style={{ marginTop: 16, maxHeight: 240, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        {["WO", "Vendor", "GL account", "Amount"].map((h) => (
                          <th key={h} style={{
                            textAlign: h === "Amount" ? "right" : "left", padding: "6px 10px", fontSize: 10.5,
                            textTransform: "uppercase", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {eligible.map(({ order, row }, i) => (
                        <tr key={`${order.id}-${row.LINE_NO}-${i}`}>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{order.wo_number || "—"}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{order.vendor?.name}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)", fontFamily: "var(--clg-font-mono, monospace)" }}>{row.ACCT_NO}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)" }}>
                            {money(row.AMOUNT)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <Button size="sm" onClick={runExport} disabled={exporting || eligible.length === 0} iconLeft={exporting ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />}>
                  {exporting ? "Exporting…" : `Download CSV & mark ${new Set(eligible.map((e) => e.order.id)).size} exported`}
                </Button>
                <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
