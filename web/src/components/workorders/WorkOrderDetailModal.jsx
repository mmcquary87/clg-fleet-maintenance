import { useState } from "react";
import { X, Loader2, ExternalLink, FileWarning } from "lucide-react";
import { Badge } from "../../ds";
import { useWorkOrder } from "../../hooks/useWorkOrder";
import { supabase } from "../../lib/supabaseClient";
import FileDropzone from "../shared/FileDropzone";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function severityTone(s) {
  if (s === "Unit down") return "critical";
  if (s === "Urgent") return "brand";
  return "neutral";
}

async function uploadReceipt(file) {
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from("invoices").upload(path, file);
  if (error) throw error;
  return path;
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function WorkOrderDetailModal({ workOrderId, onClose, onChanged }) {
  const { order, loading, error, receiptUrl, reload } = useWorkOrder(workOrderId);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const attachReceipt = async () => {
    if (!pendingFile || !order) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadReceipt(pendingFile);
      const { error: updateErr } = await supabase.from("work_orders").update({ receipt_path: path }).eq("id", order.id);
      if (updateErr) throw updateErr;
      setPendingFile(null);
      await reload();
      onChanged?.();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, .5)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 680,
          boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--clg-text-muted)" }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : error || !order ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--clg-scarlet)", fontSize: 13 }}>{error || "Work order not found."}</div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.08em" }}>
                  UNIT {order.unit?.number || "—"}
                </div>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)", marginTop: 2 }}>
                  {order.category}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {order.severity && <Badge tone={severityTone(order.severity)}>{order.severity}</Badge>}
                  {order.approval_status === "needs_approval" ? (
                    <Badge tone="critical">Needs approval</Badge>
                  ) : (
                    <Badge tone="neutral">{order.status}</Badge>
                  )}
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {(order.complaint || order.description) && (
                <div>
                  {order.complaint && <div style={{ fontSize: 13, color: "var(--clg-text-body)" }}>{order.complaint}</div>}
                  {order.description && order.description !== order.complaint && (
                    <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: order.complaint ? 4 : 0 }}>{order.description}</div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Field label="Vendor" value={order.vendor?.name} />
                <Field label="Cost" value={money(order.cost)} />
                <Field label="System / component" value={order.system_component} />
                <Field label="Date opened" value={order.date_opened} />
                <Field label="Date closed" value={order.date_closed} />
                <Field label="Promised back" value={order.promised_back} />
                <Field label="Invoice / ref #" value={order.invoice_ref} />
                <Field label="PO number" value={order.po_number} />
                <Field label="Source" value={order.source} />
                <Field label="Assigned bay" value={order.assigned_bay} />
                <Field label="Assigned tech" value={order.assigned_tech} />
                <Field label="Waiting on parts" value={order.waiting_on_parts ? (order.parts_eta ? `Yes — ETA ${order.parts_eta}` : "Yes") : null} />
                <Field label="Warranty recovery" value={order.warranty_recovery_amount ? money(order.warranty_recovery_amount) : null} />
                <Field label="Approved by" value={order.approved_by} />
                <Field label="Approved at" value={order.approved_at ? new Date(order.approved_at).toLocaleString() : null} />
              </div>

              <div>
                <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                  Receipt / invoice
                </div>
                {receiptUrl ? (
                  <a
                    href={receiptUrl} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--clg-royal)", textDecoration: "none" }}
                  >
                    <ExternalLink size={14} /> View attached invoice
                  </a>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--clg-text-muted)", marginBottom: 8 }}>
                      <FileWarning size={13} /> No invoice attached yet.
                    </div>
                    <FileDropzone file={pendingFile} onFileChange={setPendingFile} label="Drag & drop an invoice here to attach it" />
                    {pendingFile && (
                      <button
                        onClick={attachReceipt} disabled={uploading}
                        className="btn-primary" style={{ marginTop: 10 }}
                      >
                        {uploading ? <Loader2 size={14} className="spin" /> : null}
                        {uploading ? "Uploading…" : "Attach invoice"}
                      </button>
                    )}
                    {uploadError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 6 }}>{uploadError}</div>}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 12 }}>
                Created {new Date(order.created_at).toLocaleString()}
                {order.updated_at && order.updated_at !== order.created_at && ` · Updated ${new Date(order.updated_at).toLocaleString()}`}
                {order.alvys_maintenance_id && " · Imported from Alvys"}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
