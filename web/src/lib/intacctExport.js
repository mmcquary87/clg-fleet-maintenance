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

// workOrders: rows already joined with vendor:{ intacct_vendor_id } and
// carrying category/date_closed/cost/invoice_ref/wo_number/complaint/
// description. glAccountByCategory: Map<category, gl_account_number>.
//
// Returns { eligible: [{ order, row }], skipped: [{ order, reason }] } --
// never builds a row missing a field Intacct's template requires, so a
// bad row can never silently reach the CSV.
export function buildIntacctBillRows(workOrders, { glAccountByCategory, defaultTerms, batchTitle }) {
  const eligible = [];
  const skipped = [];

  for (const o of workOrders) {
    const vendorId = o.vendor?.intacct_vendor_id;
    const acctNo = glAccountByCategory.get(o.category);
    if (!vendorId) { skipped.push({ order: o, reason: "Vendor has no Sage Intacct Vendor ID mapped" }); continue; }
    if (!acctNo) { skipped.push({ order: o, reason: `"${o.category}" has no GL account mapped in Settings` }); continue; }
    if (!o.date_closed) { skipped.push({ order: o, reason: "No date closed on file" }); continue; }
    if (!o.cost) { skipped.push({ order: o, reason: "No cost on file" }); continue; }

    const description = o.complaint || o.description || "";
    const row = {
      DONOTIMPORT: "", BATCH_TITLE: batchTitle, BILL_NO: o.invoice_ref || "", PO_NO: o.wo_number || "",
      VENDOR_ID: vendorId, PAYTO: "", RETURNTO: "", POSTING_DATE: "", CREATED_DATE: o.date_closed,
      DUE_DATE: "", TOTAL_DUE: "", TOTAL_PAID: "", PAID_DATE: "", TERM_NAME: defaultTerms || "",
      DESCRIPTION: description.slice(0, 80),
      BASECURR: "", CURRENCY: "", EXCH_RATE_DATE: "", EXCH_RATE_TYPE_ID: "", EXCHANGE_RATE: "",
      LINE_NO: 1,
      MEMO: `WO ${o.wo_number || o.id} — ${description}`.slice(0, 1000),
      ACCT_NO: acctNo, ACCT_LABEL: "", LOCATION_ID: "", DEPT_ID: "",
      AMOUNT: Number(o.cost).toFixed(2),
      ALLOCATION_ID: "", APBILLITEM_APACCOUNT: "", ACTION: "", SUPDOCID: "", BILLABLE: "", BILLED: "",
      NAMEOFACQUIREDASSET: "", SELECTEDASSETMODE: "", ASSETQUANTITY: "", INCLUDETAXINASSETCOST: "",
      CLASSIFICATIONID: "", AMORTIZATIONTEMPLATEID: "", AMORTIZATIONSTARTDATE: "", AMORTIZATIONENDDATE: "",
      INVOICE_TYPE: "", INVOICE_MODE: "", APBILLITEM_CUSTOMERID: "", APBILLITEM_VENDORID: "",
      APBILLITEM_ITEMID: "", APBILLITEM_CLASSID: "", APBILLITEM_EMPLOYEEID: "",
    };
    eligible.push({ order: o, row });
  }

  return { eligible, skipped };
}
