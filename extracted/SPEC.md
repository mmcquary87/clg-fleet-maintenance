# Fleet Maintenance System — Build Spec

## Goal
Replace scattered maintenance tracking (fuel-card line items, freeform truck notes,
unlinked receipts) with a single system that:
1. Logs work orders per unit, categorized, with vendor and cost
2. Rolls up into a spend-by-unit / spend-by-category / spend-over-time dashboard
3. Auto-drafts proposed work orders from Samsara fault codes (so a vendor can have
   the likely part on hand before the truck arrives)
4. Auto-opens work orders from Samsara DVIR defects
5. Eventually: scans uploaded invoices with the Claude API to auto-fill work order
   cost/vendor/category, and feeds completed work orders into payroll

This is a rebuild of the core functionality of Samsara's own "Connected Maintenance"
module, connected to our own data (Alvys TMS + Samsara telematics).

## Current state
- A working prototype exists as a single-file React artifact (fleet-maintenance.jsx,
  included in this folder) with: Units, Vendors, Work Orders, and a Dashboard tab.
  It uses in-browser storage only — no backend, no auth, no persistence beyond the
  artifact sandbox. Treat it as the reference for the data model and UI, not
  something to keep running as-is.
- No existing Samsara integration exists anywhere in the company's tooling.
- Alvys (our TMS) does import a "Maintenance" entity via its own API (~1,659
  records last sync) but it isn't cleanly structured — a lot of maintenance spend
  is actually commingled inside fuel-card transactions (e.g. "Truck Care
  Maintenance" charges at Love's Travel Stops), and defect notes live as freeform
  "Maintenance Comment" reference fields on trucks/trailers, not linked to cost or
  vendor. Alvys also carries PM due-date fields per truck ("Next PM Date and/or
  Odometer Reading Due", "Last PM Date & Odometer Reading").

## Target architecture

```
Samsara (fault code + DVIR webhooks)
        |
        v
Backend service (Node/Express or Python/FastAPI)
  - holds SAMSARA_API_TOKEN and ANTHROPIC_API_KEY as env vars, never in code
  - webhook route: receives fault code / DVIR events
  - matches Samsara vehicle ID -> our unit record
  - DTC-to-category lookup -> drafts a proposed work order
  - invoice scan route: takes an uploaded receipt image/PDF, calls Claude API,
    returns structured {vendor, lineItems, total, category} to pre-fill a form
        |
        v
Database (Postgres or similar) — shared by backend and web app
        |
        v
Web app (the real version of the artifact prototype)
  - auth (dispatcher / mechanic / admin roles)
  - Units, Vendors, Work Orders, Dashboard
  - real file storage for uploaded receipts
```

## Data model

```
units
  id, number, type (Truck/Trailer/Van), vin, samsara_vehicle_id

vendors
  id, name, specialty_category, contact

work_orders
  id, unit_id, category, vendor_id, description, cost,
  status (Open-Proposed / Open / In Progress / Closed),
  date_opened, date_closed, invoice_ref,
  source (manual / samsara_fault / samsara_dvir),
  samsara_reference_id (nullable — links back to the fault/defect that created it)

fault_events
  id, unit_id, dtc_code, dtc_description, source (obdii/j1939),
  samsara_reading_time, matched_work_order_id, status

dvir_defects
  id, unit_id, defect_type, samsara_defect_id, is_resolved,
  created_at, matched_work_order_id
```

Fixed categories: PM / Oil, Tires, Brakes, Engine, Electrical, Transmission,
Trailer / Body, DOT Inspection, Other.

## Samsara integration details

Docs: https://developers.samsara.com/docs/telematics ,
https://developers.samsara.com/docs/fault-monitoring ,
https://developers.samsara.com/docs/digital-vehicle-inspection-reports ,
https://developers.samsara.com/docs/erp-accounting-integration (read this one —
it's Samsara's own guide for exactly this kind of external integration)

**Fault codes**
- Preferred: configure a Fault Code alert webhook in the Samsara dashboard
  (real-time push, no polling delay)
- Fallback/backfill: `GET /fleet/vehicles/stats/history?types=faultCodes` for a
  date range, or `GET /fleet/vehicles/stats/feed?types=faultCodes` for continuous
  polling with a cursor
- Payload gives OBD-II confirmed/pending/permanent DTCs (code + description,
  e.g. "P0087" / "Fuel Rail/System Pressure - Too Low Bank 1") or J1939 fault
  codes with SPN/FMI + which check-engine light is on

**DVIRs**
- `GET /fleet/dvirs/history?startTime=...&endTime=...` for full DVIRs, or
  `GET /fleet/defects/history?startTime=...&endTime=...` for just defects
- There's also a `DvirSubmitted` webhook event for real-time triggering
- Each defect has: defectType (e.g. "Battery"), vehicle, isResolved, createdAtTime
- Can write back: `PATCH /fleet/defects/:id` or `PATCH /fleet/dvirs/:id` to mark
  resolved once our work order closes, keeping Samsara's compliance record in sync

**DTC-to-category mapping**: build a lookup table (own data, not from Samsara) —
DTC code pattern -> likely part -> our category. This is what turns "P0087" into
"probably a fuel pressure sensor, tag as Engine."

## Build order
1. Stand up the real backend + database, migrate the artifact's data model into it
2. Add the Claude-API invoice scanner (highest value, no Samsara dependency)
3. Add the Samsara fault-code webhook listener -> proposed work order
4. Add the Samsara DVIR webhook listener -> open work order
5. Payroll export — needs the target payroll system identified first (ADP,
   Paycom, etc.) before this can be scoped
6. Optional: pull Alvys Trucks/Fuel/Maintenance entities in too, to reconcile
   the fuel-card-commingled maintenance spend against real work orders

## Security notes
- Samsara API token and Claude API key: environment variables on the backend
  only. Never in frontend code, never committed to git, never pasted into any
  chat interface.
- Shared work-order data means anyone with access to the deployed app sees the
  same fleet data — add real auth before this goes further than local dev.
