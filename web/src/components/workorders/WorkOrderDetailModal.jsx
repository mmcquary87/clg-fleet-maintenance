import { useState } from "react";
import { X, Loader2, ExternalLink, FileWarning, Mail, Sparkles, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input, Select } from "../../ds";
import { useWorkOrder } from "../../hooks/useWorkOrder";
import { supabase } from "../../lib/supabaseClient";
import { buildMailto } from "../../lib/mailto";
import { uploadReceipt, fileToBase64 } from "../../lib/invoiceFiles";
import { CATEGORIES } from "../../lib/categories";
import FileDropzone from "../shared/FileDropzone";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function severityTone(s) {
  if (s === "Unit down") return "critical";
  if (s === "Urgent") return "brand";
  return "neutral";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function shopHeadsUpMailto(order) {
  const vendor = order.vendor;
  if (!vendor?.contact_email) return null;
  const greeting = vendor.contact_name ? `Hi ${vendor.contact_name},` : "Hi,";
  const lines = [
    greeting,
    "",
    `Heads up — we have Unit ${order.unit?.number || "—"} headed your way${order.severity === "Unit down" ? " (URGENT — unit is down)" : ""}.`,
    "",
    `Category: ${order.category}`,
    (order.complaint || order.description) ? `Issue: ${order.complaint || order.description}` : null,
    order.promised_back ? `Needed back by: ${order.promised_back}` : null,
    order.po_number ? `PO #: ${order.po_number}` : null,
    "",
    "Let us know your earliest availability. Thanks!",
  ].filter((l) => l !== null);
  return buildMailto({
    to: vendor.contact_email,
    subject: `Heads up — Unit ${order.unit?.number || ""} inbound`,
    body: lines.join("\n"),
  });
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

function FormField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function emptyCloseLineItem(overrides) {
  return { id: uid(), category: CATEGORIES[0], description: "", cost: "", inspectionType: "", ...overrides };
}

export default function WorkOrderDetailModal({ workOrderId, onClose, onChanged }) {
  const { order, loading, error, receiptUrl, reload } = useWorkOrder(workOrderId);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const [closing, setClosing] = useState(false);
  const [closeForm, setCloseForm] = useState({ invoiceRef: "", poNumber: "", dateClosed: "" });
  const [closeLineItems, setCloseLineItems] = useState([]);
  const [closeFile, setCloseFile] = useState(null);
  const [closeScanning, setCloseScanning] = useState(false);
  const [closeScanApplied, setCloseScanApplied] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState(null);

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

  const updateStatus = async (newStatus) => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const { error: updateErr } = await supabase.from("work_orders").update({ status: newStatus }).eq("id", order.id);
      if (updateErr) throw updateErr;
      await reload();
      onChanged?.();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const openCloseForm = () => {
    setStatusError(null);
    setCloseForm({
      invoiceRef: order.invoice_ref ?? "",
      poNumber: order.po_number ?? "",
      dateClosed: todayIso(),
    });
    setCloseLineItems([
      emptyCloseLineItem({ category: order.category, description: order.description || order.complaint || "", cost: order.cost ?? "" }),
    ]);
    setCloseFile(null);
    setCloseScanApplied(false);
    setClosing(true);
  };

  const onCloseScan = async () => {
    if (!closeFile) return;
    setCloseScanning(true);
    setStatusError(null);
    try {
      const fileBase64 = await fileToBase64(closeFile);
      const { data, error: fnError } = await supabase.functions.invoke("scan-invoice", {
        body: { fileBase64, mediaType: closeFile.type },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setCloseForm((prev) => ({
        ...prev,
        invoiceRef: data.invoiceRef || prev.invoiceRef,
        dateClosed: data.date || prev.dateClosed,
      }));
      setCloseLineItems(
        data.lineItems?.length > 0
          ? data.lineItems.map((li) => emptyCloseLineItem({ category: li.category, description: li.description, cost: li.cost }))
          : [emptyCloseLineItem({ category: order.category })],
      );
      setCloseScanApplied(true);
    } catch (err) {
      setStatusError(`AI scan failed: ${err.message}. You can still fill this out manually.`);
    } finally {
      setCloseScanning(false);
    }
  };

  const setCloseLineItem = (id, k) => (e) => {
    setCloseLineItems((items) => items.map((li) => (li.id === id ? { ...li, [k]: e.target.value } : li)));
  };
  const addCloseLineItem = () => setCloseLineItems((items) => [...items, emptyCloseLineItem()]);
  const removeCloseLineItem = (id) => setCloseLineItems((items) => items.filter((li) => li.id !== id));

  const closeTotal = closeLineItems.reduce((s, li) => s + (Number(li.cost) || 0), 0);

  const confirmClose = async () => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const dateClosed = closeForm.dateClosed || todayIso();
      const receiptPath = closeFile ? await uploadReceipt(closeFile) : order.receipt_path || null;
      const [first, ...extra] = closeLineItems;

      const { error: updateErr } = await supabase.from("work_orders").update({
        status: "Closed",
        category: first.category,
        description: first.description || order.description,
        cost: Number(first.cost) || 0,
        invoice_ref: closeForm.invoiceRef || null,
        po_number: closeForm.poNumber || null,
        date_closed: dateClosed,
        ...(closeFile ? { receipt_path: receiptPath } : {}),
      }).eq("id", order.id);
      if (updateErr) throw updateErr;

      if (extra.length > 0 && order.unit?.id) {
        const rows = extra.map((li) => ({
          unit_id: order.unit.id,
          vendor_id: order.vendor?.id ?? null,
          category: li.category,
          description: li.description || null,
          cost: Number(li.cost) || 0,
          status: "Closed",
          date_opened: order.date_opened || dateClosed,
          date_closed: dateClosed,
          invoice_ref: closeForm.invoiceRef || null,
          po_number: closeForm.poNumber || null,
          source: "manual",
          receipt_path: receiptPath,
        }));
        const { error: insertErr } = await supabase.from("work_orders").insert(rows);
        if (insertErr) throw insertErr;
      }

      const unitUpdates = {};
      for (const li of closeLineItems) {
        if (li.category === "PM / Oil") {
          unitUpdates.last_pm_date = dateClosed;
        } else if (li.category === "DOT Inspection" && li.inspectionType) {
          const field = li.inspectionType === "Annual" ? "last_annual_inspection_date" : "last_midtrip_date";
          unitUpdates[field] = dateClosed;
        }
      }
      if (Object.keys(unitUpdates).length > 0 && order.unit?.id) {
        const { error: unitErr } = await supabase.from("units").update(unitUpdates).eq("id", order.unit.id);
        if (unitErr) throw unitErr;
      }

      setClosing(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusBusy(false);
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
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 720,
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
                  UNIT {order.unit?.number || "—"}{order.wo_number ? ` · ${order.wo_number}` : ""}
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
                {!closing && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {order.status === "Open" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateStatus("In Progress")} disabled={statusBusy}>
                          Start progress
                        </Button>
                        <Button size="sm" onClick={openCloseForm} disabled={statusBusy}>
                          Close work order
                        </Button>
                      </>
                    )}
                    {order.status === "In Progress" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateStatus("Open")} disabled={statusBusy}>
                          Reopen
                        </Button>
                        <Button size="sm" onClick={openCloseForm} disabled={statusBusy}>
                          Close work order
                        </Button>
                      </>
                    )}
                    {order.status === "Closed" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus("In Progress")} disabled={statusBusy}>
                        Reopen
                      </Button>
                    )}
                  </div>
                )}
                {statusError && !closing && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 8 }}>{statusError}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {shopHeadsUpMailto(order) && (
                  <Button variant="outline" size="sm" iconLeft={<Mail size={13} />} href={shopHeadsUpMailto(order)}>
                    Email shop
                  </Button>
                )}
                <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
              </div>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {closing && (
                <div style={{ border: "1px solid var(--clg-royal)", borderRadius: "var(--clg-radius-md)", padding: 16, background: "var(--clg-surface-subtle)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-royal)", marginBottom: 12 }}>
                    Close work order
                  </div>

                  <FormField label="Invoice / receipt file">
                    <FileDropzone
                      file={closeFile}
                      onFileChange={(f) => { setCloseFile(f); setCloseScanApplied(false); }}
                      label="Drag & drop the invoice here, or click to browse"
                    />
                    {closeFile && (
                      <Button
                        type="button" variant="secondary" size="sm" onClick={onCloseScan} disabled={closeScanning}
                        iconLeft={closeScanning ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                        style={{ marginTop: 10, alignSelf: "flex-start" }}
                      >
                        {closeScanning ? "Scanning…" : "Scan with AI"}
                      </Button>
                    )}
                    {closeScanApplied && (
                      <div style={{ fontSize: 11.5, color: "var(--clg-royal)", marginTop: 6, fontWeight: 600 }}>
                        AI filled in the services below from this invoice — review the categories and correct anything before saving.
                      </div>
                    )}
                  </FormField>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
                    <FormField label="Invoice / ref #">
                      <Input value={closeForm.invoiceRef} onChange={(e) => setCloseForm((f) => ({ ...f, invoiceRef: e.target.value }))} />
                    </FormField>
                    <FormField label="PO number">
                      <Input value={closeForm.poNumber} onChange={(e) => setCloseForm((f) => ({ ...f, poNumber: e.target.value }))} placeholder="e.g. PO-10245" />
                    </FormField>
                    <FormField label="Date closed">
                      <Input type="date" value={closeForm.dateClosed} onChange={(e) => setCloseForm((f) => ({ ...f, dateClosed: e.target.value }))} />
                    </FormField>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Services performed{closeLineItems.length > 1 ? ` (${closeLineItems.length})` : ""}
                      </span>
                      <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 13, color: "var(--clg-navy)", fontWeight: 700 }}>
                        {money(closeTotal)} total
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {closeLineItems.map((li) => (
                        <div key={li.id} style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 10, background: "var(--clg-surface-page, #fff)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px auto", gap: 8, alignItems: "center" }}>
                            <Select value={li.category} onChange={setCloseLineItem(li.id, "category")} options={CATEGORIES} />
                            <Input value={li.description} onChange={setCloseLineItem(li.id, "description")} placeholder="What was done" />
                            <Input
                              type="number" min="0" step="0.01"
                              value={li.cost} onChange={setCloseLineItem(li.id, "cost")} placeholder="0.00"
                              style={{ fontFamily: "var(--clg-font-mono, monospace)" }}
                            />
                            <button
                              type="button" onClick={() => removeCloseLineItem(li.id)} disabled={closeLineItems.length === 1}
                              title="Remove this service"
                              style={{
                                background: "none", border: "none", cursor: closeLineItems.length === 1 ? "not-allowed" : "pointer",
                                color: "var(--clg-text-muted)", opacity: closeLineItems.length === 1 ? 0.35 : 1, padding: 6, display: "inline-flex",
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {li.category === "DOT Inspection" && (
                            <Select
                              value={li.inspectionType} onChange={setCloseLineItem(li.id, "inspectionType")}
                              options={["Annual", "Midtrip"]} placeholder="Inspection type"
                              style={{ marginTop: 8, maxWidth: 200 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="quiet" size="sm" iconLeft={<Plus size={14} />} onClick={addCloseLineItem} style={{ marginTop: 8 }}>
                      Add another service
                    </Button>
                  </div>

                  {statusError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 10 }}>{statusError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Button size="sm" onClick={confirmClose} disabled={statusBusy} iconLeft={statusBusy ? <Loader2 size={13} className="spin" /> : null}>
                      Confirm &amp; close
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setClosing(false)} disabled={statusBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {(order.complaint || order.description) && (
                <div>
                  {order.complaint && <div style={{ fontSize: 13, color: "var(--clg-text-body)" }}>{order.complaint}</div>}
                  {order.description && order.description !== order.complaint && (
                    <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: order.complaint ? 4 : 0 }}>{order.description}</div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <Field label="WO #" value={order.wo_number} />
                <Field label="Vendor" value={order.vendor?.name} />
                <Field label="Cost" value={money(order.cost)} />
                <Field label="System / component" value={order.system_component} />
                <Field label="Date opened" value={order.date_opened} />
                <Field label="Date closed" value={order.date_closed} />
                <Field label="Promised back" value={order.promised_back} />
                <Field label="Invoice / ref #" value={order.invoice_ref} />
                <Field label="PO number" value={order.po_number} />
                <Field label="Chargeback" value={order.is_chargeback ? `Yes — ${order.chargeback_driver_name || "driver not named"}` : null} />
                <Field label="Source" value={order.source} />
                <Field label="Assigned bay" value={order.assigned_bay} />
                <Field label="Assigned tech" value={order.assigned_tech} />
                <Field label="Waiting on parts" value={order.waiting_on_parts ? (order.parts_eta ? `Yes — ETA ${order.parts_eta}` : "Yes") : null} />
                <Field label="Warranty recovery" value={order.warranty_recovery_amount ? money(order.warranty_recovery_amount) : null} />
                <Field label="Approved by" value={order.approved_by} />
                <Field label="Approved at" value={order.approved_at ? new Date(order.approved_at).toLocaleString() : null} />
              </div>

              {!closing && (
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
              )}

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
