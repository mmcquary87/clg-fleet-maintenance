import { useEffect, useState } from "react";
import { Loader2, Mail, ExternalLink, FilePlus2, CheckCircle2, X } from "lucide-react";
import { Card, Button, Input, Alert, Eyebrow, Badge } from "../../ds";
import { useInboundReceipts } from "../../hooks/useInboundReceipts";
import { CATEGORIES } from "../../lib/categories";
import { findDuplicateWorkOrders } from "../../lib/workOrderDuplicates";
import { findOpenEstimateWorkOrder } from "../../lib/workOrderEstimates";
import NewWorkOrderForm from "../NewWorkOrderForm";
import WorkOrderDetailModal from "./WorkOrderDetailModal";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function lineItemsTotal(lineItems) {
  return (lineItems || []).reduce((s, li) => s + (Number(li.cost) || 0), 0);
}

function DuplicateBanner({ duplicateInfo }) {
  if (!duplicateInfo || (duplicateInfo.workOrders.length === 0 && duplicateInfo.receipts.length === 0)) return null;
  const parts = [
    ...duplicateInfo.workOrders.map((wo) => `WO #${wo.wo_number} (${wo.date_opened}, ${money(wo.cost)}, ${wo.status})`),
    ...(duplicateInfo.receipts.length > 0 ? ["another receipt already in the inbox"] : []),
  ];
  return (
    <Alert tone="critical" style={{ marginBottom: 12 }}>
      <strong>Possible duplicate</strong> — matches {parts.join(", ")}. Review before creating a work order from this one.
    </Alert>
  );
}

function EstimateMatchBanner({ estimateMatch }) {
  if (!estimateMatch) return null;
  return (
    <Alert tone="info" style={{ marginBottom: 12 }}>
      This looks like it could be the final invoice for <strong>WO #{estimateMatch.wo_number}</strong>
      {estimateMatch.estimated_cost != null ? ` (estimated ${money(estimateMatch.estimated_cost)}, ${estimateMatch.date_opened})` : ""} —
      use "Finalize" below instead of creating a new work order.
    </Alert>
  );
}

function ReceiptCard({ receipt, onCreate, onDismiss, onFinalize, signedUrl, duplicateInfo, estimateMatch }) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(false);

  const extracted = receipt.extracted;
  const lineItems = extracted?.lineItems;

  const viewReceipt = async () => {
    if (!receipt.storage_path) return;
    setOpening(true);
    try {
      const url = await signedUrl(receipt.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setOpening(false);
    }
  };

  const confirmDismiss = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDismiss(receipt.id, reason);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      {error && <Alert tone="critical" style={{ marginBottom: 12 }}>{error}</Alert>}
      <DuplicateBanner duplicateInfo={duplicateInfo} />
      <EstimateMatchBanner estimateMatch={estimateMatch} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>
              {receipt.subject || "(no subject)"}
            </div>
            {extracted?.documentType === "estimate" && <Badge tone="outline">Estimate</Badge>}
          </div>
          <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 2 }}>
            From {receipt.from_email || "unknown sender"} · {new Date(receipt.received_at).toLocaleString()}
          </div>
        </div>
        {receipt.storage_path && (
          <Button size="sm" variant="outline" iconLeft={opening ? <Loader2 size={13} className="spin" /> : <ExternalLink size={13} />} onClick={viewReceipt} disabled={opening}>
            View receipt
          </Button>
        )}
      </div>

      {extracted ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Vendor</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)", marginTop: 2 }}>{extracted.vendor || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Unit</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: extracted.unitNumberGuess ? "var(--clg-navy)" : "var(--clg-scarlet)", marginTop: 2 }}>
              {extracted.unitNumberGuess || "Not identified"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Date</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)", marginTop: 2 }}>{extracted.date || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Total</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)", marginTop: 2 }}>{money(lineItemsTotal(lineItems))}</div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)", fontSize: 12.5, color: "var(--clg-scarlet)" }}>
          {receipt.extraction_error || "Couldn't auto-read this receipt."} {receipt.storage_path ? "Open it above and fill in the work order by hand." : ""}
        </div>
      )}

      {dismissing ? (
        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — e.g. duplicate, spam" style={{ flex: 1 }} />
          <Button size="sm" variant="outline" onClick={confirmDismiss} disabled={busy} iconLeft={busy ? <Loader2 size={13} className="spin" /> : null}>
            Confirm dismiss
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setDismissing(false)} disabled={busy}>Cancel</Button>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          {estimateMatch && (
            <Button size="sm" iconLeft={<CheckCircle2 size={14} />} onClick={() => onFinalize(receipt, estimateMatch)}>
              Finalize WO #{estimateMatch.wo_number}
            </Button>
          )}
          <Button size="sm" variant={estimateMatch ? "outline" : "primary"} iconLeft={<FilePlus2 size={14} />} onClick={() => onCreate(receipt)}>
            Create work order
          </Button>
          <Button size="sm" variant="quiet" iconLeft={<X size={14} />} onClick={() => setDismissing(true)}>
            Dismiss
          </Button>
        </div>
      )}
    </Card>
  );
}

// Dispatcher-facing review queue for emailed receipts (20261011010000_
// inbound_receipts.sql, supabase/functions/email-intake). Mirrors
// scan-invoice's own rule: nothing here was ever auto-saved as a real work
// order -- every row is reviewed and explicitly converted (or dismissed)
// by a person, same as the manual "Scan with AI" flow in NewWorkOrderForm.
export default function ReceiptInboxView() {
  const { receipts, loading, error, dismiss, markCreated, signedUrl } = useInboundReceipts();
  const [creatingFor, setCreatingFor] = useState(null);
  const [finalizingFor, setFinalizingFor] = useState(null);
  const [unitQuery, setUnitQuery] = useState("");
  const [duplicatesByReceiptId, setDuplicatesByReceiptId] = useState({});
  const [estimateMatchByReceiptId, setEstimateMatchByReceiptId] = useState({});

  // Surfaces a duplicate warning right on the inbox card, before anyone
  // clicks in -- the in-form check (NewWorkOrderForm) still runs too and is
  // the one that actually blocks Save, but a dispatcher scanning the list
  // shouldn't have to open every receipt just to spot one that's already
  // been logged (or forwarded twice). Only checks receipts with a usable
  // extraction -- nothing to compare for one that failed to scan. A
  // duplicate against another PENDING receipt only shows once both copies
  // have been scanned; against a real work order, only once the first copy
  // has actually been converted -- there's nothing to match before that.
  useEffect(() => {
    let cancelled = false;
    const extracted = receipts.filter((r) => r.extracted);
    if (extracted.length === 0) {
      setDuplicatesByReceiptId({});
      return;
    }
    (async () => {
      const entries = await Promise.all(extracted.map(async (r) => {
        const e = r.extracted;
        const totalCost = (e.lineItems || []).reduce((s, li) => s + (Number(li.cost) || 0), 0);
        try {
          const result = await findDuplicateWorkOrders({
            unitNumber: e.unitNumberGuess || "",
            vendorName: e.vendor || "",
            invoiceRef: e.invoiceRef || "",
            dateOpened: e.date || "",
            totalCost,
            excludeReceiptId: r.id,
          });
          return [r.id, result];
        } catch {
          return [r.id, { workOrders: [], receipts: [] }];
        }
      }));
      if (!cancelled) setDuplicatesByReceiptId(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [receipts]);

  // Looks for an open estimate work order this receipt could be the final
  // invoice for -- skips receipts scan-invoice itself flagged as an
  // estimate (an estimate can't finalize another estimate). Separate from
  // the duplicate check above: that one requires matching cost, which is
  // exactly what won't match here (the final invoice's whole point is a
  // different, real number).
  useEffect(() => {
    let cancelled = false;
    const candidates = receipts.filter((r) => r.extracted && r.extracted.documentType !== "estimate");
    if (candidates.length === 0) {
      setEstimateMatchByReceiptId({});
      return;
    }
    (async () => {
      const entries = await Promise.all(candidates.map(async (r) => {
        try {
          const match = await findOpenEstimateWorkOrder({
            unitNumber: r.extracted.unitNumberGuess || "",
            vendorName: r.extracted.vendor || "",
          });
          return [r.id, match];
        } catch {
          return [r.id, null];
        }
      }));
      if (!cancelled) setEstimateMatchByReceiptId(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [receipts]);

  const filteredReceipts = unitQuery.trim()
    ? receipts.filter((r) => (r.extracted?.unitNumberGuess || "").toLowerCase().includes(unitQuery.trim().toLowerCase()))
    : receipts;

  const openCreate = (receipt) => setCreatingFor(receipt);
  const openFinalize = (receipt, workOrder) => setFinalizingFor({ receipt, workOrder });

  // Reuses the exact same "receipt converted" bookkeeping as creating a
  // brand-new work order -- the receipt's content ended up reflected in a
  // real work order either way, just an existing one instead of a new one.
  const handleFinalized = async (workOrderId) => {
    const receipt = finalizingFor?.receipt;
    setFinalizingFor(null);
    if (receipt && workOrderId) {
      try {
        await markCreated(receipt.id, workOrderId);
      } catch {
        // Same cosmetic-miss reasoning as handleSaved below.
      }
    }
  };

  const handleSaved = async (workOrderId) => {
    const receipt = creatingFor;
    setCreatingFor(null);
    if (receipt && workOrderId) {
      try {
        await markCreated(receipt.id, workOrderId);
      } catch {
        // The work order itself saved fine -- losing the inbox-row link is
        // a cosmetic miss (the row just stays "pending"), not worth
        // surfacing as an error over a real save.
      }
    }
  };

  // Shape for WorkOrderDetailModal's "Close work order" form, pre-filled
  // from this receipt's own extraction + file -- so finalizing an estimate
  // doesn't mean re-downloading the file from the inbox just to re-upload
  // it into the work order by hand.
  const closePrefillFor = (receipt) => {
    const e = receipt.extracted || {};
    return {
      invoiceRef: e.invoiceRef || "",
      dateClosed: e.date || "",
      lineItems: (e.lineItems || []).map((li) => ({
        category: CATEGORIES.includes(li.category) ? li.category : CATEGORIES[0],
        description: li.description,
        cost: li.cost,
      })),
      storagePath: receipt.storage_path || null,
      fileName: receipt.file_name || null,
    };
  };

  const initialFor = (receipt) => {
    const e = receipt.extracted;
    if (!e) return undefined;
    return {
      unitNumber: e.unitNumberGuess || "",
      vendorName: e.vendor || "",
      invoiceRef: e.invoiceRef || "",
      date: e.date || "",
      isEstimate: e.documentType === "estimate",
      lineItems: (e.lineItems || []).map((li) => ({
        category: CATEGORIES.includes(li.category) ? li.category : CATEGORIES[0],
        description: li.description,
        cost: li.cost,
      })),
    };
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <Eyebrow tone="brand">Receipt Inbox</Eyebrow>
        <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
          {filteredReceipts.length} receipt{filteredReceipts.length === 1 ? "" : "s"} to review
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
          Roadside and vendor receipts forwarded by email land here first — nothing becomes a real work order until
          you review and save it.
        </p>
        <Input
          value={unitQuery}
          onChange={(e) => setUnitQuery(e.target.value)}
          placeholder="Search by unit number"
          style={{ marginTop: 12, maxWidth: 280 }}
        />
      </div>

      {creatingFor && (
        <NewWorkOrderForm
          initial={initialFor(creatingFor)}
          existingReceipt={creatingFor.storage_path ? { storagePath: creatingFor.storage_path, fileName: creatingFor.file_name } : undefined}
          sourceReceiptId={creatingFor.id}
          onCancel={() => setCreatingFor(null)}
          onSaved={handleSaved}
        />
      )}

      {finalizingFor && (
        <WorkOrderDetailModal
          workOrderId={finalizingFor.workOrder.id}
          initialCloseFromReceipt={closePrefillFor(finalizingFor.receipt)}
          onClose={() => setFinalizingFor(null)}
          onReceiptFinalized={handleFinalized}
        />
      )}

      {error && <Alert tone="critical" title="Couldn't load the receipt inbox" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading…
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 20px", textAlign: "center", color: "var(--clg-text-muted)", background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          <Mail size={24} />
          <div style={{ fontSize: 13 }}>
            {receipts.length === 0 ? "Nothing waiting for review." : "No receipts match that unit number."}
          </div>
        </div>
      ) : (
        filteredReceipts.map((r) => (
          <ReceiptCard
            key={r.id} receipt={r} onCreate={openCreate} onDismiss={dismiss} onFinalize={openFinalize} signedUrl={signedUrl}
            duplicateInfo={duplicatesByReceiptId[r.id]} estimateMatch={estimateMatchByReceiptId[r.id]}
          />
        ))
      )}
    </div>
  );
}
