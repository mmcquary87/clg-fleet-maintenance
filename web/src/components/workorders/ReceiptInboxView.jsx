import { useState } from "react";
import { Loader2, Mail, ExternalLink, FilePlus2, X } from "lucide-react";
import { Card, Button, Input, Alert, Eyebrow } from "../../ds";
import { useInboundReceipts } from "../../hooks/useInboundReceipts";
import { CATEGORIES } from "../../lib/categories";
import NewWorkOrderForm from "../NewWorkOrderForm";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function lineItemsTotal(lineItems) {
  return (lineItems || []).reduce((s, li) => s + (Number(li.cost) || 0), 0);
}

function ReceiptCard({ receipt, onCreate, onDismiss, signedUrl }) {
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>
            {receipt.subject || "(no subject)"}
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
          <Button size="sm" iconLeft={<FilePlus2 size={14} />} onClick={() => onCreate(receipt)}>
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
  const [unitQuery, setUnitQuery] = useState("");

  const filteredReceipts = unitQuery.trim()
    ? receipts.filter((r) => (r.extracted?.unitNumberGuess || "").toLowerCase().includes(unitQuery.trim().toLowerCase()))
    : receipts;

  const openCreate = (receipt) => setCreatingFor(receipt);

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

  const initialFor = (receipt) => {
    const e = receipt.extracted;
    if (!e) return undefined;
    return {
      unitNumber: e.unitNumberGuess || "",
      vendorName: e.vendor || "",
      invoiceRef: e.invoiceRef || "",
      date: e.date || "",
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
          onCancel={() => setCreatingFor(null)}
          onSaved={handleSaved}
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
          <ReceiptCard key={r.id} receipt={r} onCreate={openCreate} onDismiss={dismiss} signedUrl={signedUrl} />
        ))
      )}
    </div>
  );
}
