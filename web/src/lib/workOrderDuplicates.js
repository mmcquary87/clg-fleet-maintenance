import { supabase } from "./supabaseClient";

const COST_TOLERANCE = 0.01;

// Collapses the formatting noise that's routine for AI-extracted text --
// double spaces, a trailing period/comma a second scan of the same receipt
// didn't produce, case -- without touching anything that could actually
// distinguish two different real-world vendors/units (store numbers, internal
// punctuation). Exact-string comparison on raw extraction output was too
// brittle: two scans of literally the same receipt aren't guaranteed to come
// back byte-identical.
function norm(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]+$/, "");
}

function sameCost(a, b) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < COST_TOLERANCE;
}

// Compares calendar day only, tolerant of format drift between scan-invoice's
// requested YYYY-MM-DD and an occasional MM/DD/YYYY slip -- plain string
// equality on two differently-formatted-but-identical dates was a silent
// miss. Postgres's date_opened and a conforming scan both hit the ISO branch;
// this is a fallback, not the expected path.
function parseDateParts(s) {
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  return s.trim();
}

function sameDate(a, b) {
  const pa = parseDateParts(a);
  const pb = parseDateParts(b);
  return Boolean(pa && pb && pa === pb);
}

// Looks for an existing work order, or another still-pending (or already
// converted) inbound receipt, that looks like the same real-world purchase
// -- so creating a work order from a receipt (or typing one in by hand)
// can't silently double up the same invoice. Two match tiers, either one is
// enough to flag:
//   - same unit + vendor + a non-empty invoice_ref (case/whitespace-insensitive)
//   - same unit + vendor + same date + same total cost (catches a missing
//     or mistyped invoice_ref -- the common case for a handwritten roadside
//     receipt)
// The inbound_receipts check is what catches the same email receipt
// forwarded twice before either copy gets converted -- the work_orders
// check alone can't see that case. Returns no work-order matches when the
// unit or vendor doesn't exist yet (a brand new unit/vendor can't collide
// with a prior work order).
export async function findDuplicateWorkOrders({
  unitNumber, vendorName, invoiceRef, dateOpened, totalCost, excludeReceiptId,
}) {
  const unitTrimmed = (unitNumber || "").trim();
  const vendorTrimmed = (vendorName || "").trim();
  if (!unitTrimmed || !vendorTrimmed) return { workOrders: [], receipts: [] };

  const [{ data: unit }, { data: vendor }] = await Promise.all([
    supabase.from("units").select("id").ilike("number", norm(unitTrimmed)).maybeSingle(),
    supabase.from("vendors").select("id").ilike("name", norm(vendorTrimmed)).maybeSingle(),
  ]);

  let workOrders = [];
  if (unit && vendor) {
    const { data } = await supabase
      .from("work_orders")
      .select("id, wo_number, date_opened, cost, invoice_ref, status")
      .eq("unit_id", unit.id)
      .eq("vendor_id", vendor.id)
      .eq("voided", false);
    workOrders = (data || []).filter((wo) => {
      const refMatch = Boolean(invoiceRef?.trim() && wo.invoice_ref && norm(wo.invoice_ref) === norm(invoiceRef));
      const dateCostMatch = Boolean(dateOpened && totalCost > 0 && sameDate(wo.date_opened, dateOpened) && sameCost(wo.cost, totalCost));
      return refMatch || dateCostMatch;
    });
  }

  const { data: otherReceipts } = await supabase
    .from("inbound_receipts")
    .select("id, subject, received_at, extracted, status")
    .neq("status", "dismissed")
    .not("extracted", "is", null);

  const receipts = (otherReceipts || []).filter((r) => {
    if (r.id === excludeReceiptId) return false;
    const e = r.extracted || {};
    if (!norm(e.unitNumberGuess) || norm(e.unitNumberGuess) !== norm(unitTrimmed)) return false;
    if (!norm(e.vendor) || norm(e.vendor) !== norm(vendorTrimmed)) return false;
    const refMatch = Boolean(invoiceRef?.trim() && e.invoiceRef && norm(e.invoiceRef) === norm(invoiceRef));
    const total = (e.lineItems || []).reduce((s, li) => s + (Number(li.cost) || 0), 0);
    const dateCostMatch = Boolean(dateOpened && totalCost > 0 && sameDate(e.date, dateOpened) && sameCost(total, totalCost));
    return refMatch || dateCostMatch;
  });

  return { workOrders, receipts };
}
