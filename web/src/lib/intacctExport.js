// Sage Intacct AP Bills import — CSV row builder for the Work Orders
// export. Column names/order come from CLG's own real Intacct Bills
// import template (uploaded 2026-09-11, 48 columns) -- see
// DESIGN_QUEUE.md's "Sage Intacct integration" item. Only fields we have
// real data for are filled in; everything else stays blank rather than
// guessed -- Intacct's own template marks all but five columns
// (VENDOR_ID, CREATED_DATE, DUE_DATE-or-TERM_NAME, LINE_NO, ACCT_NO,
// AMOUNT) as "Required: No".
//
// DUE_DATE is deliberately left blank in favor of TERM_NAME -- Intacct
// computes the due date from the term itself, so this app never has to
// guess at day-count math for a policy it doesn't own.
//
// GL account routing (confirmed against CLG's real chart of accounts,
// 2026-09-16): the accounts split by asset type (Truck/Trailer) and
// transaction type (Inspection / Tires / Repairs & Maintenance / Parts),
// NOT by our work order categories directly -- "DOT Inspection" and
// "Mid-Trip Inspection" both map to the same Inspection account (they're
// the same transaction type on CLG's chart of accounts), "Tires" maps to
// its own account, everything else collapses into the "Repairs &
// Maintenance" bucket. Repairs & Maintenance on a TRUCK
// further splits Company vs Owner-Operator based on that truck's
// `owner_operator_assigned` flag (Units page) -- a systematic safeguard
// rather than trusting a work order's "Charge Back to Driver" checkbox
// was remembered every time, since that flag can also be set for a
// company-driver chargeback unrelated to owner-operator status.
//
// Parts vs labor: Intacct's VENDOR_ID is a hard-required field on every
// bill, so a work order with NO vendor attached at all (a pure in-house
// job -- the Mechanic queue's "New job" flow never sets one) can never
// produce a valid bill row, no matter what it cost: there's no one to
// bill it against in Sage. That's the correct outcome, not a gap to work
// around -- an employee's labor is wages, already run through payroll,
// never a real AP payable. A vendor-attached work order's cost IS a real
// payable; if parts were also logged against it (work_order_parts), the
// bill splits into two lines against that same vendor (parts + the
// remaining repair amount) instead of one lump sum, so parts spend shows
// separately in Intacct. Attaching a vendor (e.g. a parts supplier) to
// an otherwise in-house job is the way to make its parts cost
// exportable -- there's no separate "parts vendor" concept.

export const INTACCT_BILL_COLUMNS = [
  "DONOTIMPORT", "BATCH_TITLE", "BILL_NO", "PO_NO", "VENDOR_ID", "PAYTO", "RETURNTO",
  "POSTING_DATE", "CREATED_DATE", "DUE_DATE", "TOTAL_DUE", "TOTAL_PAID", "PAID_DATE",
  "TERM_NAME", "DESCRIPTION", "BASECURR", "CURRENCY", "EXCH_RATE_DATE", "EXCH_RATE_TYPE_ID",
  "EXCHANGE_RATE", "LINE_NO", "MEMO", "ACCT_NO", "ACCT_LABEL", "LOCATION_ID", "DEPT_ID",
  "AMOUNT", "ALLOCATION_ID", "APBILLITEM_APACCOUNT", "ACTION", "SUPDOCID", "BILLABLE",
  "BILLED", "NAMEOFACQUIREDASSET", "SELECTEDASSETMODE", "ASSETQUANTITY",
  "INCLUDETAXINASSETCOST", "CLASSIFICATIONID", "AMORTIZATIONTEMPLATEID",
  "AMORTIZATIONSTARTDATE", "AMORTIZATIONENDDATE", "INVOICE_TYPE", "INVOICE_MODE",
  "APBILLITEM_CUSTOMERID", "APBILLITEM_VENDORID", "APBILLITEM_ITEMID", "APBILLITEM_CLASSID",
  "APBILLITEM_EMPLOYEEID",
];

export const INTACCT_EXPORT_CSV_COLUMNS = INTACCT_BILL_COLUMNS.map((name) => ({
  label: name,
  value: (row) => row[name],
}));

export function partsCostFor(order) {
  return (order.parts ?? []).reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);
}

// Returns the GL account number for a work order's non-parts (Inspection/
// Tires/Repairs) line, or null if the needed account isn't configured.
function repairAccountFor(order, glMap) {
  const isTruck = order.unit?.type === "Truck";
  if (order.category === "DOT Inspection" || order.category === "Mid-Trip Inspection") {
    return isTruck ? glMap.truck_inspection_account : glMap.trailer_inspection_account;
  }
  if (order.category === "Tires") {
    return isTruck ? glMap.truck_tires_account : glMap.trailer_tires_account;
  }
  if (isTruck) {
    return order.unit?.owner_operator_assigned
      ? glMap.truck_repairs_owner_operator_account
      : glMap.truck_repairs_company_account;
  }
  return glMap.trailer_repairs_account;
}

function partsAccountFor(order, glMap) {
  const isTruck = order.unit?.type === "Truck";
  if (isTruck) return glMap.truck_parts_account;
  // No distinct trailer parts account in CLG's chart of accounts --
  // defaults to Trailer Repairs & Maint. unless configured separately.
  return glMap.trailer_parts_account || glMap.trailer_repairs_account;
}

function baseRow({ vendorId, invoiceRef, poNumber, dateClosed, defaultTerms, description, batchTitle }) {
  return {
    DONOTIMPORT: "", BATCH_TITLE: batchTitle, BILL_NO: invoiceRef || "", PO_NO: poNumber || "",
    VENDOR_ID: vendorId, PAYTO: "", RETURNTO: "", POSTING_DATE: "", CREATED_DATE: dateClosed,
    DUE_DATE: "", TOTAL_DUE: "", TOTAL_PAID: "", PAID_DATE: "", TERM_NAME: defaultTerms || "",
    DESCRIPTION: description.slice(0, 80),
    BASECURR: "", CURRENCY: "", EXCH_RATE_DATE: "", EXCH_RATE_TYPE_ID: "", EXCHANGE_RATE: "",
    ACCT_LABEL: "", LOCATION_ID: "", DEPT_ID: "",
    ALLOCATION_ID: "", APBILLITEM_APACCOUNT: "", ACTION: "", SUPDOCID: "", BILLABLE: "", BILLED: "",
    NAMEOFACQUIREDASSET: "", SELECTEDASSETMODE: "", ASSETQUANTITY: "", INCLUDETAXINASSETCOST: "",
    CLASSIFICATIONID: "", AMORTIZATIONTEMPLATEID: "", AMORTIZATIONSTARTDATE: "", AMORTIZATIONENDDATE: "",
    INVOICE_TYPE: "", INVOICE_MODE: "", APBILLITEM_CUSTOMERID: "", APBILLITEM_VENDORID: "",
    APBILLITEM_ITEMID: "", APBILLITEM_CLASSID: "", APBILLITEM_EMPLOYEEID: "",
  };
}

// workOrders: rows joined with vendor:{ intacct_vendor_id }, unit:{ type,
// owner_operator_assigned }, and parts:work_order_parts(quantity,
// unit_cost) -- carrying category/date_closed/cost/invoice_ref/wo_number/
// complaint/description.
//
// Returns { eligible: [{ order, row }], skipped: [{ order, reason }] }. A
// vendor-attached work order with parts also logged produces two rows
// (parts + remaining repair amount); every other exportable case
// produces exactly one.
export function buildIntacctBillRows(workOrders, { glMap, defaultTerms, batchTitle }) {
  const eligible = [];
  const skipped = [];

  for (const o of workOrders) {
    const vendorId = o.vendor?.intacct_vendor_id;
    if (!vendorId) {
      skipped.push({ order: o, reason: "In-house work order (no vendor attached) — nothing payable to Sage; labor is wages, not an AP bill" });
      continue;
    }
    if (!o.date_closed) { skipped.push({ order: o, reason: "No date closed on file" }); continue; }
    const totalCost = Number(o.cost) || 0;
    if (totalCost <= 0) { skipped.push({ order: o, reason: "No cost on file" }); continue; }

    const description = o.complaint || o.description || "";
    const parts = Math.min(partsCostFor(o), totalCost);
    const repairAmount = totalCost - parts;
    let lineNo = 1;
    const rows = [];
    const reasons = [];

    if (parts > 0) {
      const partsAcct = partsAccountFor(o, glMap);
      if (partsAcct) {
        const row = baseRow({ vendorId, invoiceRef: o.invoice_ref, poNumber: o.wo_number, dateClosed: o.date_closed, defaultTerms, description, batchTitle });
        row.LINE_NO = lineNo++;
        row.MEMO = `WO ${o.wo_number || o.id} — parts — ${description}`.slice(0, 1000);
        row.ACCT_NO = partsAcct;
        row.AMOUNT = parts.toFixed(2);
        rows.push(row);
      } else {
        reasons.push("no Parts GL account configured for this unit type");
      }
    }

    if (repairAmount > 0) {
      const repairAcct = repairAccountFor(o, glMap);
      if (repairAcct) {
        const row = baseRow({ vendorId, invoiceRef: o.invoice_ref, poNumber: o.wo_number, dateClosed: o.date_closed, defaultTerms, description, batchTitle });
        row.LINE_NO = lineNo++;
        row.MEMO = `WO ${o.wo_number || o.id} — ${description}`.slice(0, 1000);
        row.ACCT_NO = repairAcct;
        row.AMOUNT = repairAmount.toFixed(2);
        rows.push(row);
      } else {
        reasons.push(`no GL account configured for "${o.category}" on this unit type/ownership`);
      }
    }

    if (reasons.length > 0) {
      skipped.push({ order: o, reason: `Missing GL account — ${reasons.join("; ")}` });
      continue;
    }
    for (const row of rows) eligible.push({ order: o, row });
  }

  return { eligible, skipped };
}
