# Design queue

Running list of UI/UX items to revisit and perfect before this goes live.
Nothing here blocks the build — flag something, add it below, keep moving.
We do a full pass through this list before launch.

## Baseline

- [ ] Confirm Company view / By-Unit view toggle matches the interaction
      pattern in [extracted/fleet-dashboard-full.jsx](extracted/fleet-dashboard-full.jsx)
      (fleet-wide spend by category/vendor + KPI stats + insight banners on
      Company; clickable unit cards -> categorized breakdown + line items on
      By-Unit)
- [ ] Confirm color palette / type system carried over as-is (amber/red/blue
      industrial palette, Barlow Condensed + IBM Plex Sans/Mono) vs. wants
      changes

## Open items

- [ ] Sage Intacct integration (2026-09-11). Two related pieces:
      1. **Export Work Order costs as AP Bills.** Field mapping already
         scoped against Intacct's standard Bills import template (48
         columns): `VENDOR_ID`/`CREATED_DATE`/`LINE_NO`/`AMOUNT`/`ACCT_NO`
         are required; `BILL_NO` <- `invoice_ref`, `PO_NO` <- `wo_number`,
         `DESCRIPTION` <- `complaint`/`description`, `CREATED_DATE` <-
         `date_closed`. Still needs from CLG before this can be built: a
         GL account number per work order category, a vendor name ->
         Intacct `VENDOR_ID` cross-reference, a payment-terms/due-date
         policy (`TERM_NAME` vs. computed `DUE_DATE`), and whether
         Department/Location/Class dimensions are used. Open design
         question: one-time export script vs. a permanent "Export to
         Intacct" feature (e.g. on the Work Orders page) — leaning
         permanent since this'll run monthly, but needs a home for the GL
         account map + vendor cross-reference (probably Settings).
      2. **Search a vendor + invoice to confirm it exists in both this
         system and Sage Intacct** (reconciliation / duplicate-catching).
         Bigger lift than #1: needs read access to Intacct (not just a
         one-way export), and depends on #1's vendor cross-reference
         existing first so a vendor name here can be matched to its
         Intacct vendor record.

_(add items here as they come up during the build)_

## How to use this

- Building something and a styling/UX call feels bikeshed-y or premature?
  Ship a reasonable default, add a line here, move on.
- Want to change something you see running? Say so — I'll add it here if
  it's not a quick fix, or just make the change if it is.
- Before "going live" (first real deploy anyone but us uses), we go through
  every unchecked item together.
