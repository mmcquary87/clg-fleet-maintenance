import { useEffect, useState } from "react";
import { X, Loader2, Mail, Sparkles, Plus, Trash2, Pencil, Ban, RotateCcw } from "lucide-react";
import { Badge, Button, Input, Select, Alert } from "../../ds";
import { useWorkOrder } from "../../hooks/useWorkOrder";
import { useVendors } from "../../hooks/useVendors";
import { updateUnitMaintenanceFields } from "../../hooks/useUnits";
import { useAuth } from "../../hooks/useAuth";
import { useProfile } from "../../hooks/useProfile";
import { supabase } from "../../lib/supabaseClient";
import { logWorkOrderActivity } from "../../lib/workOrderActivityLog";
import { useWorkOrderActivityLog } from "../../hooks/useWorkOrderActivityLog";
import { buildMailto } from "../../lib/mailto";
import { uploadReceipt, fileToBase64 } from "../../lib/invoiceFiles";
import { describeFunctionError } from "../../lib/functionError";
import { CATEGORIES, sanitizeCategory } from "../../lib/categories";
import { PAYMENT_METHODS } from "../../lib/paymentMethods";
import FileDropzone from "../shared/FileDropzone";
import ChargebackDriverPicker from "../shared/ChargebackDriverPicker";
import WorkOrderDocumentsPanel from "./WorkOrderDocumentsPanel";

const SEVERITIES = ["Routine", "Urgent", "Unit down"];

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

const ACTION_LABEL = {
  created: "Created",
  status_changed: "Status changed",
  approved: "Approved",
  voided: "Voided",
  unvoided: "Un-voided",
  deleted: "Deleted",
  marked_paid: "Marked paid",
  payment_reopened: "Payment reopened",
  chargeback_deducted: "Chargeback marked deducted",
  chargeback_undeducted: "Chargeback deduction reopened",
  edited: "Details edited",
  closed: "Closed",
  invoice_added: "Invoice added",
};

function ActivityLogPanel({ woNumber }) {
  const [open, setOpen] = useState(false);
  const { entries, loading } = useWorkOrderActivityLog(open ? woNumber : null);

  return (
    <div style={{ borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11.5, color: "var(--clg-royal)", fontWeight: 600 }}
      >
        {open ? "Hide activity log" : "Show activity log"}
      </button>
      {open && (
        loading ? (
          <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>No activity logged yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ fontSize: 12, color: "var(--clg-text-body)" }}>
                <span style={{ fontWeight: 600 }}>{ACTION_LABEL[e.action] || e.action}</span>
                {" by "}{e.actor}{" · "}{new Date(e.created_at).toLocaleString()}
                {e.detail && <div style={{ color: "var(--clg-text-muted)", marginTop: 1 }}>{e.detail}</div>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function emptyCloseLineItem(overrides) {
  return { id: uid(), category: CATEGORIES[0], description: "", cost: "", inspectionType: "", ...overrides };
}

// Plain-language diff for the activity log -- only the fields that
// actually changed, as "Label: old → new" (blank shown as "—").
const DETAILS_DIFF_FIELDS = [
  ["Category", (o) => o.category, (f) => f.category],
  ["Severity", (o) => o.severity, (f) => f.severity],
  ["System/component", (o) => o.system_component, (f) => f.systemComponent],
  ["Complaint", (o) => o.complaint, (f) => f.complaint],
  ["Assigned bay", (o) => o.assigned_bay, (f) => f.assignedBay],
  ["Assigned tech", (o) => o.assigned_tech, (f) => f.assignedTech],
  ["Promised back", (o) => o.promised_back?.slice(0, 10), (f) => f.promisedBack],
  ["PO #", (o) => o.po_number, (f) => f.poNumber],
  ["Waiting on parts", (o) => !!o.waiting_on_parts, (f) => f.waitingOnParts],
  ["Parts ETA", (o) => o.parts_eta?.slice(0, 10), (f) => f.partsEta],
  ["Chargeback", (o) => !!o.is_chargeback, (f) => f.isChargeback],
  ["Chargeback driver", (o) => o.chargeback_driver_name, (f) => f.chargebackDriver],
];

function diffDetails(order, form, vendors) {
  const diffs = [];
  for (const [label, fromOrder, fromForm] of DETAILS_DIFF_FIELDS) {
    const before = fromOrder(order) ?? "";
    const after = fromForm(form) ?? "";
    if (String(before) !== String(after)) diffs.push(`${label}: ${before === "" ? "—" : before} → ${after === "" ? "—" : after}`);
  }
  const beforeVendorId = order.vendor?.id ?? "";
  const afterVendorId = form.vendorId ?? "";
  if (beforeVendorId !== afterVendorId) {
    const afterVendor = vendors.find((v) => v.id === afterVendorId);
    diffs.push(`Vendor: ${order.vendor?.name || "—"} → ${afterVendor?.name || "—"}`);
  }
  return diffs.join("; ") || null;
}

function emptyDetailsForm() {
  return {
    category: "", severity: "", vendorId: "", systemComponent: "", complaint: "",
    assignedBay: "", assignedTech: "", promisedBack: "", poNumber: "",
    waitingOnParts: false, partsEta: "",
    isChargeback: false, chargebackDriver: "", chargebackDriverId: null,
  };
}

export default function WorkOrderDetailModal({ workOrderId, onClose, onChanged }) {
  const { order, loading, error, reload } = useWorkOrder(workOrderId);
  const { vendors } = useVendors();
  const { session } = useAuth();
  const { canVoidWorkOrders, canDeleteWorkOrders } = useProfile(session?.user?.id);

  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState(null);
  const [groupSiblings, setGroupSiblings] = useState([]);
  const [voidWholeGroup, setVoidWholeGroup] = useState(false);

  // Permanent delete -- unlike void (reversible, keeps history), this
  // actually removes the row. Gated server-side by a trigger requiring
  // admin or can_delete_work_orders (20261012040000), same pattern as
  // voiding's own trigger. Requires typing the work order's own number to
  // confirm, since there's no "un-delete" the way there's an "un-void".
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [editingPayment, setEditingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ method: PAYMENT_METHODS[0], reference: "", paidAt: todayIso() });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const [closing, setClosing] = useState(false);
  const [closeForm, setCloseForm] = useState({ invoiceRef: "", poNumber: "", dateClosed: "" });
  const [closeLineItems, setCloseLineItems] = useState([]);
  const [closeFile, setCloseFile] = useState(null);
  const [closeScanning, setCloseScanning] = useState(false);
  const [closeScanApplied, setCloseScanApplied] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState(emptyDetailsForm());

  // A second (or third) invoice landing on the same job later -- e.g. a
  // parts invoice after the labor invoice already closed this work order.
  // Shares work_order_group_id with `order` so the Work Orders list keeps
  // showing them bundled as one work order rather than starting a new one.
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [addInvoiceForm, setAddInvoiceForm] = useState({ invoiceRef: "", poNumber: "", dateOpened: "" });
  const [addInvoiceLineItems, setAddInvoiceLineItems] = useState([]);
  const [addInvoiceFile, setAddInvoiceFile] = useState(null);
  const [addInvoiceScanning, setAddInvoiceScanning] = useState(false);
  const [addInvoiceScanApplied, setAddInvoiceScanApplied] = useState(false);
  const [addInvoiceBusy, setAddInvoiceBusy] = useState(false);
  const [addInvoiceError, setAddInvoiceError] = useState(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState(null);

  // For the in-house labor+parts cost estimate below -- fetched once, not
  // per work order, same singleton-row config IntakeWizard reads for
  // approval_threshold.
  const [laborRate, setLaborRate] = useState(0);
  useEffect(() => {
    supabase.from("app_settings").select("shop_labor_rate").single()
      .then(({ data }) => setLaborRate(Number(data?.shop_labor_rate) || 0));
  }, []);

  const partsCost = (order?.parts ?? []).reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);
  const laborCost = (Number(order?.labor_hours) || 0) * laborRate;
  const inHouseCost = partsCost + laborCost;
  const hasMechanicData = order && (order.labor_hours != null || order.parts?.length > 0);

  const saveUnitCost = async (partId, raw) => {
    const val = raw.trim() === "" ? null : Number(raw);
    await supabase.from("work_order_parts").update({ unit_cost: val }).eq("id", partId);
    await reload();
  };

  const saveCategory = async (partId, category) => {
    await supabase.from("work_order_parts").update({ category }).eq("id", partId);
    await reload();
  };

  const updateStatus = async (newStatus) => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const { error: updateErr } = await supabase.from("work_orders").update({ status: newStatus }).eq("id", order.id);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: "status_changed", detail: `${order.status} → ${newStatus}` });
      await reload();
      onChanged?.();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusBusy(false);
    }
  };

  // Same update the Board's "Authorize" button performs (UnitCard.jsx) --
  // that was previously the only place to clear "needs approval", forcing
  // a detour away from this modal just to come back and close the order.
  const approve = async () => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase.from("work_orders").update({
        approval_status: "approved",
        approved_by: user?.email,
        approved_at: new Date().toISOString(),
      }).eq("id", order.id);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: "approved" });
      await reload();
      onChanged?.();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const openVoidForm = () => {
    setStatusError(null);
    setClosing(false);
    setEditingDetails(false);
    setAddingInvoice(false);
    setDeleting(false);
    setVoidReason("");
    setVoidError(null);
    setVoidWholeGroup(false);
    setGroupSiblings([]);
    setVoiding(true);
    // Lets a grouped invoice (several work_orders rows sharing one
    // work_order_group_id -- see groupByWorkOrder in WorkOrdersView.jsx)
    // be voided all at once instead of one row at a time, for exactly the
    // case Debbie hit with WO-6588: an estimate that created a dozen
    // linked rows that all needed to go away together.
    if (order.work_order_group_id) {
      supabase.from("work_orders").select("id, wo_number")
        .eq("work_order_group_id", order.work_order_group_id)
        .neq("id", order.id)
        .then(({ data }) => setGroupSiblings(data ?? []));
    }
  };

  const confirmVoid = async () => {
    setVoidBusy(true);
    setVoidError(null);
    try {
      const idsToVoid = voidWholeGroup ? [order.id, ...groupSiblings.map((s) => s.id)] : [order.id];
      const { error: updateErr } = await supabase.from("work_orders").update({
        voided: true,
        voided_at: new Date().toISOString(),
        voided_reason: voidReason.trim() || null,
      }).in("id", idsToVoid);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: "voided", detail: voidReason.trim() || null });
      if (voidWholeGroup) {
        for (const s of groupSiblings) {
          logWorkOrderActivity({
            workOrderId: s.id, woNumber: s.wo_number, action: "voided",
            detail: `Voided together with ${order.wo_number}${voidReason.trim() ? ` — ${voidReason.trim()}` : ""}`,
          });
        }
      }
      setVoiding(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setVoidError(err.message);
    } finally {
      setVoidBusy(false);
    }
  };

  const unvoid = async () => {
    setVoidBusy(true);
    setVoidError(null);
    try {
      const { error: updateErr } = await supabase.from("work_orders").update({
        voided: false, voided_at: null, voided_reason: null,
      }).eq("id", order.id);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: "unvoided" });
      await reload();
      onChanged?.();
    } catch (err) {
      setVoidError(err.message);
    } finally {
      setVoidBusy(false);
    }
  };

  const openDeleteForm = () => {
    setStatusError(null);
    setClosing(false);
    setEditingDetails(false);
    setAddingInvoice(false);
    setVoiding(false);
    setEditingPayment(false);
    setDeleteConfirmText("");
    setDeleteError(null);
    setDeleting(true);
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      // Logged before the delete, not after -- once the row is gone there's
      // nothing left to log against (work_order_id goes null, but the
      // wo_number/detail captured here is what makes the entry still mean
      // something).
      await logWorkOrderActivity({
        workOrderId: order.id, woNumber: order.wo_number, action: "deleted",
        detail: `Unit ${order.unit?.number || "—"} · ${order.category} · ${money(order.cost)}`,
      });
      const { error: deleteErr } = await supabase.from("work_orders").delete().eq("id", order.id);
      if (deleteErr) throw deleteErr;
      onChanged?.();
      onClose();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const openPaymentForm = () => {
    setStatusError(null);
    setClosing(false);
    setEditingDetails(false);
    setVoiding(false);
    setAddingInvoice(false);
    setDeleting(false);
    setPaymentForm({ method: PAYMENT_METHODS[0], reference: "", paidAt: todayIso() });
    setPaymentError(null);
    setEditingPayment(true);
  };

  const confirmPayment = async () => {
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const { error: updateErr } = await supabase.from("work_orders").update({
        payment_status: "paid",
        payment_method: paymentForm.method,
        payment_reference: paymentForm.reference.trim() || null,
        paid_at: paymentForm.paidAt,
      }).eq("id", order.id);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({
        workOrderId: order.id, woNumber: order.wo_number, action: "marked_paid",
        detail: `${paymentForm.method}${paymentForm.reference.trim() ? ` · Ref ${paymentForm.reference.trim()}` : ""}`,
      });
      setEditingPayment(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setPaymentError(err.message);
    } finally {
      setPaymentBusy(false);
    }
  };

  const reopenPayment = async () => {
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const { error: updateErr } = await supabase.from("work_orders").update({
        payment_status: "unpaid", payment_method: null, payment_reference: null, paid_at: null,
      }).eq("id", order.id);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: "payment_reopened" });
      await reload();
      onChanged?.();
    } catch (err) {
      setPaymentError(err.message);
    } finally {
      setPaymentBusy(false);
    }
  };

  // Whether this chargeback's been pulled from the driver's pay yet --
  // same before/nothing pattern as payment_status/paid_at above, so
  // payroll has a real "done" state instead of the Deductions report
  // showing every non-voided chargeback forever.
  const toggleDeducted = async () => {
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const wasDeducted = !!order.chargeback_deducted_at;
      const { error: updateErr } = await supabase.from("work_orders").update({
        chargeback_deducted_at: wasDeducted ? null : new Date().toISOString(),
      }).eq("id", order.id);
      if (updateErr) throw updateErr;
      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: wasDeducted ? "chargeback_undeducted" : "chargeback_deducted" });
      await reload();
      onChanged?.();
    } catch (err) {
      setPaymentError(err.message);
    } finally {
      setPaymentBusy(false);
    }
  };

  const openCloseForm = () => {
    setStatusError(null);
    setEditingDetails(false);
    setAddingInvoice(false);
    setDeleting(false);
    setCloseForm({
      invoiceRef: order.invoice_ref ?? "",
      poNumber: order.po_number ?? "",
      dateClosed: todayIso(),
    });
    // If there's no cost on file yet but the mechanic logged parts/hours,
    // prefill with that estimate instead of blank -- still just a starting
    // point the closer reviews/edits, not treated as final.
    const prefillCost = order.cost ? order.cost : (inHouseCost > 0 ? Math.round(inHouseCost * 100) / 100 : "");
    setCloseLineItems([
      emptyCloseLineItem({ category: order.category, description: order.description || order.complaint || "", cost: prefillCost }),
    ]);
    setCloseFile(null);
    setCloseScanApplied(false);
    setClosing(true);
  };

  const openDetailsForm = () => {
    setStatusError(null);
    setClosing(false);
    setAddingInvoice(false);
    setDeleting(false);
    setDetailsForm({
      category: order.category ?? "",
      severity: order.severity ?? "",
      vendorId: order.vendor?.id ?? "",
      systemComponent: order.system_component ?? "",
      complaint: order.complaint ?? "",
      assignedBay: order.assigned_bay ?? "",
      assignedTech: order.assigned_tech ?? "",
      promisedBack: order.promised_back ? order.promised_back.slice(0, 10) : "",
      poNumber: order.po_number ?? "",
      waitingOnParts: !!order.waiting_on_parts,
      partsEta: order.parts_eta ? order.parts_eta.slice(0, 10) : "",
      isChargeback: !!order.is_chargeback,
      chargebackDriver: order.chargeback_driver_name ?? "",
      chargebackDriverId: order.chargeback_driver_id ?? null,
    });
    setEditingDetails(true);
  };

  const confirmDetails = async () => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const { error: updateErr } = await supabase.from("work_orders").update({
        category: detailsForm.category,
        severity: detailsForm.severity || null,
        vendor_id: detailsForm.vendorId || null,
        system_component: detailsForm.systemComponent || null,
        complaint: detailsForm.complaint || null,
        assigned_bay: detailsForm.assignedBay || null,
        assigned_tech: detailsForm.assignedTech || null,
        promised_back: detailsForm.promisedBack || null,
        po_number: detailsForm.poNumber || null,
        waiting_on_parts: detailsForm.waitingOnParts,
        parts_eta: detailsForm.waitingOnParts ? (detailsForm.partsEta || null) : null,
        is_chargeback: detailsForm.isChargeback,
        chargeback_driver_name: detailsForm.isChargeback ? (detailsForm.chargebackDriver.trim() || null) : null,
        chargeback_driver_id: detailsForm.isChargeback ? detailsForm.chargebackDriverId : null,
      }).eq("id", order.id);
      if (updateErr) throw updateErr;

      logWorkOrderActivity({ workOrderId: order.id, woNumber: order.wo_number, action: "edited", detail: diffDetails(order, detailsForm, vendors) });
      setEditingDetails(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusBusy(false);
    }
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
          ? data.lineItems.map((li) => emptyCloseLineItem({ category: sanitizeCategory(li.category), description: li.description, cost: li.cost }))
          : [emptyCloseLineItem({ category: order.category })],
      );
      setCloseScanApplied(true);
    } catch (err) {
      setStatusError(`AI scan failed: ${await describeFunctionError(err)}. You can still fill this out manually.`);
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
      const multiItem = extra.length > 0;
      const closeTotal = closeLineItems.reduce((s, li) => s + (Number(li.cost) || 0), 0);

      const { error: updateErr } = await supabase.from("work_orders").update({
        status: "Closed",
        category: first.category,
        description: first.description || order.description,
        cost: multiItem ? closeTotal : (Number(first.cost) || 0),
        invoice_ref: closeForm.invoiceRef || null,
        po_number: closeForm.poNumber || null,
        date_closed: dateClosed,
        ...(closeFile ? { receipt_path: receiptPath } : {}),
      }).eq("id", order.id);
      if (updateErr) throw updateErr;

      // Several repair categories on one invoice are now line items under
      // this SAME work order (work_order_line_items), not separate sibling
      // work_orders rows -- the table's own trigger keeps this row's cost
      // in sync as the true sum. ALL line items (including the first) go
      // in here once there's more than one, so that sum is complete.
      if (multiItem) {
        const lineItemRows = closeLineItems.map((li) => ({
          work_order_id: order.id,
          category: li.category,
          description: li.description || null,
          cost: Number(li.cost) || 0,
        }));
        const { error: liErr } = await supabase.from("work_order_line_items").insert(lineItemRows);
        if (liErr) throw liErr;
      }

      logWorkOrderActivity({
        workOrderId: order.id, woNumber: order.wo_number, action: "closed",
        detail: `${money(closeTotal)}${multiItem ? ` · ${closeLineItems.length} line items` : ""}`,
      });

      // A file uploaded at close time also becomes a real
      // work_order_documents row (not just the legacy receipt_path column
      // above) so it shows up immediately in the multi-document list, same
      // as attaching one manually via WorkOrderDocumentsPanel.
      if (closeFile) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: docErr } = await supabase.from("work_order_documents").insert({
          work_order_id: order.id, storage_path: receiptPath, file_name: closeFile.name, uploaded_by: user?.id ?? null,
        });
        if (docErr) throw docErr;
      }

      const unitUpdates = {};
      for (const li of closeLineItems) {
        if (li.category === "PM / Oil") {
          unitUpdates.last_pm_date = dateClosed;
          // PM reads by mileage now -- stamp from the unit's current
          // (Samsara-synced) odometer at close time, same moment
          // last_pm_date gets stamped. Left unset if the unit has no
          // odometer reading on file yet (e.g. a trailer).
          if (order.unit?.odometer != null) unitUpdates.last_pm_odometer = order.unit.odometer;
        } else if (li.category === "DOT Inspection" && li.inspectionType) {
          const field = li.inspectionType === "Annual" ? "last_annual_inspection_date" : "last_midtrip_date";
          unitUpdates[field] = dateClosed;
        } else if (li.category === "Mid-Trip Inspection") {
          unitUpdates.last_midtrip_date = dateClosed;
        }
      }
      if (Object.keys(unitUpdates).length > 0 && order.unit?.id) {
        const { error: unitErr } = await updateUnitMaintenanceFields(order.unit.id, unitUpdates);
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

  const openAddInvoiceForm = () => {
    setStatusError(null);
    setClosing(false);
    setEditingDetails(false);
    setVoiding(false);
    setEditingPayment(false);
    setDeleting(false);
    setAddInvoiceForm({ invoiceRef: "", poNumber: "", dateOpened: todayIso() });
    setAddInvoiceLineItems([emptyCloseLineItem({ category: order.category })]);
    setAddInvoiceFile(null);
    setAddInvoiceScanApplied(false);
    setAddInvoiceError(null);
    setAddingInvoice(true);
  };

  const onAddInvoiceScan = async () => {
    if (!addInvoiceFile) return;
    setAddInvoiceScanning(true);
    setAddInvoiceError(null);
    try {
      const fileBase64 = await fileToBase64(addInvoiceFile);
      const { data, error: fnError } = await supabase.functions.invoke("scan-invoice", {
        body: { fileBase64, mediaType: addInvoiceFile.type },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setAddInvoiceForm((prev) => ({
        ...prev,
        invoiceRef: data.invoiceRef || prev.invoiceRef,
        dateOpened: data.date || prev.dateOpened,
      }));
      setAddInvoiceLineItems(
        data.lineItems?.length > 0
          ? data.lineItems.map((li) => emptyCloseLineItem({ category: sanitizeCategory(li.category), description: li.description, cost: li.cost }))
          : [emptyCloseLineItem({ category: order.category })],
      );
      setAddInvoiceScanApplied(true);
    } catch (err) {
      setAddInvoiceError(`AI scan failed: ${await describeFunctionError(err)}. You can still fill this out manually.`);
    } finally {
      setAddInvoiceScanning(false);
    }
  };

  const setAddInvoiceLineItem = (id, k) => (e) => {
    setAddInvoiceLineItems((items) => items.map((li) => (li.id === id ? { ...li, [k]: e.target.value } : li)));
  };
  const addAddInvoiceLineItem = () => setAddInvoiceLineItems((items) => [...items, emptyCloseLineItem()]);
  const removeAddInvoiceLineItem = (id) => setAddInvoiceLineItems((items) => items.filter((li) => li.id !== id));

  const addInvoiceTotal = addInvoiceLineItems.reduce((s, li) => s + (Number(li.cost) || 0), 0);

  const confirmAddInvoice = async () => {
    if (!order.unit?.id) {
      setAddInvoiceError("This work order has no unit on file.");
      return;
    }
    setAddInvoiceBusy(true);
    setAddInvoiceError(null);
    try {
      const dateOpened = addInvoiceForm.dateOpened || todayIso();
      const receiptPath = addInvoiceFile ? await uploadReceipt(addInvoiceFile) : null;

      // A second invoice on the same job adds work_order_line_items under
      // THIS work order (same WO number, same status/void/payment state)
      // instead of creating new sibling work_orders rows -- the line
      // items table's own trigger folds the new cost into order.cost.
      const lineItemRows = addInvoiceLineItems.map((li) => ({
        work_order_id: order.id,
        category: li.category,
        description: li.description || null,
        cost: Number(li.cost) || 0,
      }));
      const { error: liErr } = await supabase.from("work_order_line_items").insert(lineItemRows);
      if (liErr) throw liErr;

      if (receiptPath) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: docErr } = await supabase.from("work_order_documents").insert({
          work_order_id: order.id, storage_path: receiptPath, file_name: addInvoiceFile.name, uploaded_by: user?.id ?? null,
        });
        if (docErr) throw docErr;
      }

      logWorkOrderActivity({
        workOrderId: order.id, woNumber: order.wo_number, action: "invoice_added",
        detail: `${lineItemRows.length} line item(s) · ${money(addInvoiceTotal)}`
          + (addInvoiceForm.invoiceRef ? ` · Ref ${addInvoiceForm.invoiceRef}` : "")
          + (addInvoiceForm.poNumber ? ` · PO ${addInvoiceForm.poNumber}` : "")
          + ` · dated ${dateOpened}`,
      });

      setAddingInvoice(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setAddInvoiceError(err.message);
    } finally {
      setAddInvoiceBusy(false);
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
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
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
                  {order.voided && <Badge tone="neutral">Voided</Badge>}
                  {order.severity && <Badge tone={severityTone(order.severity)}>{order.severity}</Badge>}
                  {order.approval_status === "needs_approval" ? (
                    <Badge tone="critical">Needs approval</Badge>
                  ) : (
                    <Badge tone="neutral">{order.status}</Badge>
                  )}
                  {!order.voided && (
                    <Badge tone={order.payment_status === "paid" ? "brand" : "outline"}>
                      {order.payment_status === "paid" ? "Paid" : "Unpaid"}
                    </Badge>
                  )}
                  {order.exported_to_intacct_at && (
                    <Badge tone="neutral" title={`Exported to Sage Intacct ${order.exported_to_intacct_at.slice(0, 10)}`}>
                      Exported {order.exported_to_intacct_at.slice(0, 10)}
                    </Badge>
                  )}
                  {order.is_chargeback && (
                    <Badge tone={order.chargeback_deducted_at ? "brand" : "outline"}>
                      {order.chargeback_deducted_at ? `Deducted ${order.chargeback_deducted_at.slice(0, 10)}` : "Not deducted"}
                    </Badge>
                  )}
                </div>
                {!closing && !editingDetails && !voiding && !editingPayment && !addingInvoice && !deleting && !order.voided && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {order.approval_status === "needs_approval" && (
                      <Button size="sm" onClick={approve} disabled={statusBusy} iconLeft={statusBusy ? <Loader2 size={12} className="spin" /> : null}>
                        Authorize
                      </Button>
                    )}
                    <Button size="sm" variant="outline" iconLeft={<Pencil size={12} />} onClick={openDetailsForm} disabled={statusBusy}>
                      Edit details
                    </Button>
                    <Button size="sm" variant="outline" iconLeft={<Plus size={12} />} onClick={openAddInvoiceForm} disabled={statusBusy}>
                      Add another invoice
                    </Button>
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
                    {order.payment_status === "paid" ? (
                      <Button size="sm" variant="outline" iconLeft={paymentBusy ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />} onClick={reopenPayment} disabled={paymentBusy}>
                        Reopen payment
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={openPaymentForm} disabled={statusBusy}>
                        Mark as paid
                      </Button>
                    )}
                    {order.is_chargeback && (
                      <Button
                        size="sm" variant="outline"
                        iconLeft={paymentBusy ? <Loader2 size={12} className="spin" /> : order.chargeback_deducted_at ? <RotateCcw size={12} /> : null}
                        onClick={toggleDeducted} disabled={paymentBusy}
                      >
                        {order.chargeback_deducted_at ? "Undo deducted" : "Mark deducted"}
                      </Button>
                    )}
                    {canVoidWorkOrders && (
                      <Button size="sm" variant="outline" iconLeft={<Ban size={12} />} onClick={openVoidForm} disabled={statusBusy}>
                        Void
                      </Button>
                    )}
                    {canDeleteWorkOrders && (
                      <Button size="sm" variant="outline" iconLeft={<Trash2 size={12} />} onClick={openDeleteForm} disabled={statusBusy} style={{ color: "var(--clg-scarlet)", borderColor: "var(--clg-scarlet)" }}>
                        Delete
                      </Button>
                    )}
                  </div>
                )}
                {order.voided && canVoidWorkOrders && (
                  <div style={{ marginTop: 12 }}>
                    <Button size="sm" variant="outline" iconLeft={voidBusy ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />} onClick={unvoid} disabled={voidBusy}>
                      Un-void
                    </Button>
                  </div>
                )}
                {statusError && !closing && !editingDetails && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 8 }}>{statusError}</div>}
                {voidError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 8 }}>{voidError}</div>}
                {paymentError && !editingPayment && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 8 }}>{paymentError}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {shopHeadsUpMailto(order) && (
                  <Button variant="outline" size="sm" iconLeft={<Mail size={13} />} href={shopHeadsUpMailto(order)}>
                    Email shop
                  </Button>
                )}
                <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
              </div>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {order.voided && (
                <Alert tone="critical" title="This work order is voided">
                  It's excluded from spend, cost/mile, and board tracking everywhere in the app.
                  {order.voided_reason && <div style={{ marginTop: 4 }}>Reason: {order.voided_reason}</div>}
                  {order.voided_at && <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.8 }}>Voided {new Date(order.voided_at).toLocaleString()}</div>}
                </Alert>
              )}

              {voiding && (
                <div style={{ border: "1px solid var(--clg-scarlet)", borderRadius: "var(--clg-radius-md)", padding: 16, background: "var(--clg-surface-subtle)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-scarlet)", marginBottom: 12 }}>
                    Void this work order
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginBottom: 12 }}>
                    It stays in the record for history, but is removed from spend, cost/mile, and board tracking until un-voided.
                  </div>
                  <FormField label="Reason (optional)">
                    <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. duplicate entry, entered on wrong unit" />
                  </FormField>
                  {groupSiblings.length > 0 && (
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, marginTop: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={voidWholeGroup} onChange={(e) => setVoidWholeGroup(e.target.checked)} style={{ marginTop: 2 }} />
                      <span>
                        Also void the other {groupSiblings.length} work order{groupSiblings.length === 1 ? "" : "s"} in this group
                        ({groupSiblings.map((s) => s.wo_number).join(", ")})
                      </span>
                    </label>
                  )}
                  {voidError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 10 }}>{voidError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Button size="sm" onClick={confirmVoid} disabled={voidBusy} iconLeft={voidBusy ? <Loader2 size={13} className="spin" /> : <Ban size={13} />}>
                      {voidWholeGroup ? `Confirm void (${groupSiblings.length + 1} work orders)` : "Confirm void"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setVoiding(false)} disabled={voidBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {deleting && (
                <div style={{ border: "1px solid var(--clg-scarlet)", borderRadius: "var(--clg-radius-md)", padding: 16, background: "var(--clg-surface-subtle)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-scarlet)", marginBottom: 12 }}>
                    Permanently delete this work order
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginBottom: 12 }}>
                    This removes the row entirely -- unlike voiding, there is no undo. Use Void instead unless this
                    work order genuinely shouldn't exist (e.g. a duplicate created by mistake).
                  </div>
                  <FormField label={`Type the work order number ("${order.wo_number}") to confirm`}>
                    <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={order.wo_number} />
                  </FormField>
                  {deleteError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 10 }}>{deleteError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Button
                      size="sm" onClick={confirmDelete} disabled={deleteBusy || deleteConfirmText !== order.wo_number}
                      iconLeft={deleteBusy ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      style={{ background: "var(--clg-scarlet)", borderColor: "var(--clg-scarlet)" }}
                    >
                      Permanently delete
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleting(false)} disabled={deleteBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {!editingPayment && order.payment_status === "paid" && (
                <Alert tone="brand" title="Paid">
                  {order.payment_method}{order.paid_at ? ` on ${order.paid_at}` : ""}
                  {order.payment_reference ? ` · Ref ${order.payment_reference}` : ""}
                </Alert>
              )}

              {editingPayment && (
                <div style={{ border: "1px solid var(--clg-royal)", borderRadius: "var(--clg-radius-md)", padding: 16, background: "var(--clg-surface-subtle)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-royal)", marginBottom: 12 }}>
                    Mark as paid
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField label="Method">
                      <Select
                        value={paymentForm.method}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                        options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                      />
                    </FormField>
                    <FormField label="Date paid">
                      <Input type="date" value={paymentForm.paidAt} onChange={(e) => setPaymentForm((f) => ({ ...f, paidAt: e.target.value }))} />
                    </FormField>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <FormField label="Reference # (optional)">
                      <Input
                        value={paymentForm.reference}
                        onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                        placeholder="Check #, confirmation #, last 4 of card"
                      />
                    </FormField>
                  </div>
                  {paymentError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 10 }}>{paymentError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Button size="sm" onClick={confirmPayment} disabled={paymentBusy} iconLeft={paymentBusy ? <Loader2 size={13} className="spin" /> : null}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingPayment(false)} disabled={paymentBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

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

              {addingInvoice && (
                <div style={{ border: "1px solid var(--clg-royal)", borderRadius: "var(--clg-radius-md)", padding: 16, background: "var(--clg-surface-subtle)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-royal)", marginBottom: 4 }}>
                    Add another invoice
                  </div>
                  <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginBottom: 12 }}>
                    For a second invoice on this same job (e.g. a parts invoice after the labor invoice) -- stays grouped with this work order instead of starting a new one.
                  </div>

                  <FormField label="Invoice / receipt file">
                    <FileDropzone
                      file={addInvoiceFile}
                      onFileChange={(f) => { setAddInvoiceFile(f); setAddInvoiceScanApplied(false); }}
                      label="Drag & drop the invoice here, or click to browse"
                    />
                    {addInvoiceFile && (
                      <Button
                        type="button" variant="secondary" size="sm" onClick={onAddInvoiceScan} disabled={addInvoiceScanning}
                        iconLeft={addInvoiceScanning ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                        style={{ marginTop: 10, alignSelf: "flex-start" }}
                      >
                        {addInvoiceScanning ? "Scanning…" : "Scan with AI"}
                      </Button>
                    )}
                    {addInvoiceScanApplied && (
                      <div style={{ fontSize: 11.5, color: "var(--clg-royal)", marginTop: 6, fontWeight: 600 }}>
                        AI filled in the services below from this invoice — review the categories and correct anything before saving.
                      </div>
                    )}
                  </FormField>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
                    <FormField label="Invoice / ref #">
                      <Input value={addInvoiceForm.invoiceRef} onChange={(e) => setAddInvoiceForm((f) => ({ ...f, invoiceRef: e.target.value }))} />
                    </FormField>
                    <FormField label="PO number">
                      <Input value={addInvoiceForm.poNumber} onChange={(e) => setAddInvoiceForm((f) => ({ ...f, poNumber: e.target.value }))} placeholder="e.g. PO-10245" />
                    </FormField>
                    <FormField label="Date">
                      <Input type="date" value={addInvoiceForm.dateOpened} onChange={(e) => setAddInvoiceForm((f) => ({ ...f, dateOpened: e.target.value }))} />
                    </FormField>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Line items{addInvoiceLineItems.length > 1 ? ` (${addInvoiceLineItems.length})` : ""}
                      </span>
                      <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 13, color: "var(--clg-navy)", fontWeight: 700 }}>
                        {money(addInvoiceTotal)} total
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {addInvoiceLineItems.map((li) => (
                        <div key={li.id} style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 10, background: "var(--clg-surface-page, #fff)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px auto", gap: 8, alignItems: "center" }}>
                            <Select value={li.category} onChange={setAddInvoiceLineItem(li.id, "category")} options={CATEGORIES} />
                            <Input value={li.description} onChange={setAddInvoiceLineItem(li.id, "description")} placeholder="What was done" />
                            <Input
                              type="number" min="0" step="0.01"
                              value={li.cost} onChange={setAddInvoiceLineItem(li.id, "cost")} placeholder="0.00"
                              style={{ fontFamily: "var(--clg-font-mono, monospace)" }}
                            />
                            <button
                              type="button" onClick={() => removeAddInvoiceLineItem(li.id)} disabled={addInvoiceLineItems.length === 1}
                              title="Remove this line item"
                              style={{
                                background: "none", border: "none", cursor: addInvoiceLineItems.length === 1 ? "not-allowed" : "pointer",
                                color: "var(--clg-text-muted)", opacity: addInvoiceLineItems.length === 1 ? 0.35 : 1, padding: 6, display: "inline-flex",
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="quiet" size="sm" iconLeft={<Plus size={14} />} onClick={addAddInvoiceLineItem} style={{ marginTop: 8 }}>
                      Add another line item
                    </Button>
                  </div>

                  {addInvoiceError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 10 }}>{addInvoiceError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Button size="sm" onClick={confirmAddInvoice} disabled={addInvoiceBusy} iconLeft={addInvoiceBusy ? <Loader2 size={13} className="spin" /> : null}>
                      Save invoice
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAddingInvoice(false)} disabled={addInvoiceBusy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {editingDetails && (
                <div style={{ border: "1px solid var(--clg-navy)", borderRadius: "var(--clg-radius-md)", padding: 16, background: "var(--clg-surface-subtle)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-navy)", marginBottom: 12 }}>
                    Edit work order details
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <FormField label="Category">
                      <Select value={detailsForm.category} onChange={(e) => setDetailsForm((f) => ({ ...f, category: e.target.value }))} options={CATEGORIES} />
                    </FormField>
                    <FormField label="Severity">
                      <Select
                        value={detailsForm.severity} onChange={(e) => setDetailsForm((f) => ({ ...f, severity: e.target.value }))}
                        options={SEVERITIES} placeholder="No severity"
                      />
                    </FormField>
                    <FormField label="Vendor">
                      <Select
                        value={detailsForm.vendorId} onChange={(e) => setDetailsForm((f) => ({ ...f, vendorId: e.target.value }))}
                        options={vendors.map((v) => ({ value: v.id, label: v.name }))} placeholder="— none —"
                      />
                    </FormField>
                    <FormField label="System / component">
                      <Input value={detailsForm.systemComponent} onChange={(e) => setDetailsForm((f) => ({ ...f, systemComponent: e.target.value }))} />
                    </FormField>
                    <FormField label="Assigned bay">
                      <Input value={detailsForm.assignedBay} onChange={(e) => setDetailsForm((f) => ({ ...f, assignedBay: e.target.value }))} />
                    </FormField>
                    <FormField label="Assigned tech">
                      <Input value={detailsForm.assignedTech} onChange={(e) => setDetailsForm((f) => ({ ...f, assignedTech: e.target.value }))} />
                    </FormField>
                    <FormField label="Promised back">
                      <Input type="date" value={detailsForm.promisedBack} onChange={(e) => setDetailsForm((f) => ({ ...f, promisedBack: e.target.value }))} />
                    </FormField>
                    <FormField label="PO number">
                      <Input value={detailsForm.poNumber} onChange={(e) => setDetailsForm((f) => ({ ...f, poNumber: e.target.value }))} placeholder="e.g. PO-10245" />
                    </FormField>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <FormField label="Complaint / notes">
                      <textarea
                        value={detailsForm.complaint} onChange={(e) => setDetailsForm((f) => ({ ...f, complaint: e.target.value }))} rows={2}
                        style={{
                          width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: "var(--clg-size-body)",
                          color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
                          borderRadius: "var(--clg-radius-sm)", padding: "11px 12px", resize: "vertical",
                        }}
                      />
                    </FormField>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--clg-text-body)", cursor: "pointer" }}>
                      <input
                        type="checkbox" checked={detailsForm.waitingOnParts}
                        onChange={(e) => setDetailsForm((f) => ({ ...f, waitingOnParts: e.target.checked }))}
                      />
                      Waiting on parts
                    </label>
                    {detailsForm.waitingOnParts && (
                      <Input
                        type="date" value={detailsForm.partsEta}
                        onChange={(e) => setDetailsForm((f) => ({ ...f, partsEta: e.target.value }))}
                        style={{ maxWidth: 180 }}
                      />
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--clg-text-body)", cursor: "pointer" }}>
                      <input
                        type="checkbox" checked={detailsForm.isChargeback}
                        onChange={(e) => setDetailsForm((f) => ({ ...f, isChargeback: e.target.checked }))}
                      />
                      Charge back to driver
                    </label>
                    {detailsForm.isChargeback && (
                      <ChargebackDriverPicker
                        name={detailsForm.chargebackDriver}
                        onChange={(name, driverId) => setDetailsForm((f) => ({ ...f, chargebackDriver: name, chargebackDriverId: driverId }))}
                      />
                    )}
                  </div>

                  {statusError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12, marginTop: 10 }}>{statusError}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <Button size="sm" onClick={confirmDetails} disabled={statusBusy} iconLeft={statusBusy ? <Loader2 size={13} className="spin" /> : null}>
                      Save changes
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDetails(false)} disabled={statusBusy}>
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

              {order.lineItems?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                    Line items ({order.lineItems.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {order.lineItems.map((li) => (
                      <div
                        key={li.id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          fontSize: 12.5, color: "var(--clg-text-body)", background: "var(--clg-surface-subtle)",
                          borderRadius: "var(--clg-radius-sm)", padding: "6px 10px",
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <strong>{li.category}</strong>
                          {li.description ? ` — ${li.description}` : ""}
                          {li.is_chargeback && (
                            <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--clg-scarlet)", fontWeight: 700 }}>
                              CHARGEBACK{li.chargeback_driver_name ? ` · ${li.chargeback_driver_name}` : ""}
                            </span>
                          )}
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--clg-navy)", flexShrink: 0 }}>{money(li.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {order.parts?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                    Parts used (logged by mechanic)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {order.parts.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          fontSize: 12.5, color: "var(--clg-text-body)", background: "var(--clg-surface-subtle)",
                          borderRadius: "var(--clg-radius-sm)", padding: "6px 10px",
                        }}
                      >
                        <span>{p.part_name} × {p.quantity}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <Select
                            value={p.category || order.category}
                            onChange={(e) => saveCategory(p.id, e.target.value)}
                            options={CATEGORIES}
                            style={{ width: 150, fontSize: 12, padding: "3px 6px" }}
                          />
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--clg-text-muted)" }}>
                            $
                            <input
                              type="number" min="0" step="0.01" defaultValue={p.unit_cost ?? ""} placeholder="cost each"
                              onBlur={(e) => saveUnitCost(p.id, e.target.value)}
                              style={{ width: 74, fontSize: 12, padding: "3px 6px", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)" }}
                            />
                            each
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasMechanicData && (
                <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: "10px 12px" }}>
                  <strong style={{ color: "var(--clg-navy)" }}>Estimated in-house cost: {money(inHouseCost)}</strong>
                  <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
                    {money(partsCost)} parts + {order.labor_hours ?? 0} hr × {money(laborRate)}/hr labor
                    {laborRate === 0 && order.labor_hours ? " — set a shop labor rate in Settings to price labor" : ""}
                  </div>
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
                <Field label="Labor hours" value={order.labor_hours != null ? `${order.labor_hours} hr` : null} />
                <Field label="Waiting on parts" value={order.waiting_on_parts ? (order.parts_eta ? `Yes — ETA ${order.parts_eta}` : "Yes") : null} />
                <Field label="Warranty recovery" value={order.warranty_recovery_amount ? money(order.warranty_recovery_amount) : null} />
                <Field label="Approved by" value={order.approved_by} />
                <Field label="Approved at" value={order.approved_at ? new Date(order.approved_at).toLocaleString() : null} />
              </div>

              {!closing && <WorkOrderDocumentsPanel workOrderId={order.id} />}

              <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 12 }}>
                Created {new Date(order.created_at).toLocaleString()}
                {order.updated_at && order.updated_at !== order.created_at && ` · Updated ${new Date(order.updated_at).toLocaleString()}`}
                {order.alvys_maintenance_id && " · Imported from Alvys"}
              </div>

              {!closing && <ActivityLogPanel woNumber={order.wo_number} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
