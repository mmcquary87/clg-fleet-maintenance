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

// Sage Intacct AP Bills export -- see intacctExport.js for the column
// mapping and DESIGN_QUEUE.md's "Sage Intacct integration" item for the
// full design. Eligible = Closed, non-voided, vendor-billed, has a real
// cost, and hasn't already been exported (exported_to_intacct_at is
// null) -- filtered by date_closed via the same DateRangeFilter used
// everywhere else in this app.
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
        .select("id, wo_number, category, cost, date_closed, invoice_ref, complaint, description, vendor:vendors(id, name, intacct_vendor_id)")
        .eq("status", "Closed")
        .eq("voided", false)
        .not("vendor_id", "is", null)
        .gt("cost", 0)
        .is("exported_to_intacct_at", null)
        .order("date_closed", { ascending: true });
      if (range?.start) query = query.gte("date_closed", range.start);
      if (range?.end) query = query.lte("date_closed", range.end);

      const [ordersRes, glRes, settingsRes] = await Promise.all([
        query,
        supabase.from("wo_category_gl_accounts").select("category, gl_account_number"),
        supabase.from("app_settings").select("default_payment_terms").single(),
      ]);
      if (cancelled) return;
      if (ordersRes.error) {
        setError(ordersRes.error.message);
        setLoading(false);
        return;
      }

      const glAccountByCategory = new Map((glRes.data ?? []).map((r) => [r.category, r.gl_account_number]));
      const batchTitle = `CLG Fleet Maintenance ${new Date().toISOString().slice(0, 10)}`;
      const { eligible: e, skipped: s } = buildIntacctBillRows(ordersRes.data ?? [], {
        glAccountByCategory, defaultTerms: settingsRes.data?.default_payment_terms, batchTitle,
      });
      setEligible(e);
      setSkipped(s);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  const totalAmount = eligible.reduce((s, { order }) => s + (Number(order.cost) || 0), 0);

  const runExport = async () => {
    setExporting(true);
    setError(null);
    try {
      downloadCsv(
        `intacct-ap-bills-${new Date().toISOString().slice(0, 10)}.csv`,
        eligible.map((e) => e.row),
        INTACCT_EXPORT_CSV_COLUMNS
      );
      const ids = eligible.map((e) => e.order.id);
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
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 720,
          maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700, color: "var(--clg-navy)" }}>Export to Sage Intacct</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 14 }}>
            Closed, vendor-billed work orders with a real cost that haven't been exported before. Filters by date closed.
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
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--clg-navy)" }}>{eligible.length} · {money(totalAmount)}</div>
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
                        {["WO", "Vendor", "Category", "Amount"].map((h) => (
                          <th key={h} style={{
                            textAlign: h === "Amount" ? "right" : "left", padding: "6px 10px", fontSize: 10.5,
                            textTransform: "uppercase", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {eligible.map(({ order }) => (
                        <tr key={order.id}>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{order.wo_number || "—"}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{order.vendor?.name}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{order.category}</td>
                          <td style={{ padding: "6px 10px", borderBottom: "1px solid var(--clg-border-subtle)", textAlign: "right", fontFamily: "var(--clg-font-mono, monospace)" }}>
                            {money(order.cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <Button size="sm" onClick={runExport} disabled={exporting || eligible.length === 0} iconLeft={exporting ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />}>
                  {exporting ? "Exporting…" : `Download CSV & mark ${eligible.length} exported`}
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
