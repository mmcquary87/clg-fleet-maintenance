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

* A working prototype exists as a single-file React artifact (fleet-maintenance.jsx,
included in this folder) with: Units, Vendors, Work Orders, and a Dashboard tab.
It uses in-browser storage only — no backend, no auth, no persistence beyond the
artifact sandbox. Treat it as the reference for the data model and UI, not
something to keep running as-is.
* A second, more refined prototype (fleet-dashboard-full.jsx) demonstrates the
target UX for Phase 1: a toggle between a **Company view** (fleet-wide spend
by category and by vendor, KPI stats, insight banners) and a **By-Unit view**
(clickable unit cards; clicking one shows that unit's categorized spend
breakdown as a bar chart plus every line item behind it). Build the real
frontend around this interaction pattern.
* No existing Samsara integration exists anywhere in the company's tooling.
* No in-house IT and no prior experience standing up backend infrastructure —
this drove the managed-services architecture decision above. Team is
comfortable using Claude Code interactively but won't be maintaining a
traditional server.

## Real invoice data already processed (proof of concept for the invoice scanner)

Six real closed work orders from Love's/Speedco (Total Truck Care network) and
River City Truck Center were manually extracted and categorized during
scoping — this is effectively hand-verification of what the Claude-API invoice
scanner (Phase 1) needs to do automatically:

|Unit|Category|Vendor|Cost|Ref|
|-|-|-|-|-|
|100143|Tires|Speedco — Brunswick, GA|$722.99|4010677669|
|30323|Tires|Love's TruckCare — Calhoun, GA|$359.89|4010672514|
|012042|Tires|Love's #00470 — Jasper, FL|$742.72|4010679779|
|448353|Trailer/Body (+DOT insp.)|Love's #00802 — Milton, FL|$339.37|4010678501|
|33046|Tires|Speedco — Jackson, GA|$652.38|4010685207|
|3419|Engine/PM/Electrical/Body/Other (6-task visit)|River City Truck Center — Jacksonville, FL|$13,761.71|RO 5383|

Two insights surfaced purely from categorizing this data — the kind of thing
the finished system should flag automatically:

1. **Pattern detection**: 4 of the 5 non-3419 work orders were tire
blowouts/sidewall failures within a 48-hour window across different
terminals — worth a rule that flags repeated-category clusters by
date/geography, not just raw spend totals.
2. **Warranty recovery**: unit 3419's repair notes said "customer has NTP
warranty" but no warranty claim was applied to a $10,612.57 engine repair,
unlike a comparable failure processed the same way at the same shop for a
different customer that WAS covered. A rule cross-referencing "warranty
mentioned in notes" against "warranty actually applied" could catch this
automatically in the future.

One invoice was deliberately excluded during this process: an NTP warranty
claim + repair invoice billed to a different company (Silver Moon
Transportation, unit #7516) that came from the same repair shop group. Only
process invoices bill-to CLG Transportation, LLC — don't assume shared vendor
means shared fleet data.

* Alvys (our TMS) does import a "Maintenance" entity via its own API (\~1,659
records last sync) but it isn't cleanly structured — a lot of maintenance spend
is actually commingled inside fuel-card transactions (e.g. "Truck Care
Maintenance" charges at Love's Travel Stops), and defect notes live as freeform
"Maintenance Comment" reference fields on trucks/trailers, not linked to cost or
vendor. Alvys also carries PM due-date fields per truck ("Next PM Date and/or
Odometer Reading Due", "Last PM Date \& Odometer Reading").

## Target architecture — REVISED: no in-house IT, no server to babysit

CLG has no in-house IT and no experience standing up backend infrastructure.
A self-hosted Node/Express server is a 24/7 operational liability (if it goes
down and nobody notices, a Samsara webhook silently gets dropped). Use managed
services instead so there's no server to patch, restart, or monitor:

* **Supabase** — managed Postgres + built-in auth + auto-generated REST API +
Edge Functions (serverless functions that can receive Samsara/webhook calls
without anyone running or maintaining a server). Generous free tier.
* **Frontend hosting**: Vercel or Azure Static Web Apps — deploy the dashboard
as a static/React app, connects directly to Supabase.
* **Azure fits too** if preferred (company is already on Microsoft 365 —
single sign-on, one bill) via Azure Functions (serverless, same rationale as
Supabase Edge Functions) + Azure Database for PostgreSQL + Azure Static Web
Apps. Either Supabase or Azure works; pick one, don't mix.

```
Samsara (fault code + DVIR webhooks)
        |
        v
Edge Function / Serverless Function (Supabase Edge Function or Azure Function)
  - holds SAMSARA\_API\_TOKEN and ANTHROPIC\_API\_KEY as env vars/secrets, never in code
  - webhook handler: receives fault code / DVIR events
  - matches Samsara vehicle ID -> our unit record
  - DTC-to-category lookup -> drafts a proposed work order
  - invoice scan function: takes an uploaded receipt image/PDF, calls Claude API,
    returns structured {vendor, lineItems, total, category} to pre-fill a form
        |
        v
Supabase Postgres (managed) — shared by functions and web app, built-in auth
        |
        v
Web app (React, deployed to Vercel / Azure Static Web Apps)
  - auth (dispatcher / mechanic / admin roles) via Supabase Auth
  - Company view (fleet-wide spend by category/vendor) and By-Unit view
    (click a unit -> categorized breakdown + line items) — both already
    prototyped, see fleet-dashboard-full.jsx
  - real file storage for uploaded receipts (Supabase Storage)
```

### Build sequencing — deliberately phased around the ops risk

* **Phase 1 (low risk, no 24/7 responsibility)**: dashboard + invoice scanner,
deployed as a normal web app. If it's briefly unavailable, nothing breaks —
someone just uploads invoices a little later. Build and stabilize this first.
* **Phase 2 (real ops responsibility — hold off until ready)**: Samsara
fault-code and DVIR webhook automation. Only turn this on once there's
either (a) a managed setup with monitoring/alerting in place, or (b) a
person or contractor who owns checking on it. A dropped webhook here means
a missed proactive maintenance flag, not just a slow dashboard.

## Data model

```
units
  id, number, type (Truck/Trailer/Van), vin, samsara\_vehicle\_id

vendors
  id, name, specialty\_category, contact

work\_orders
  id, unit\_id, category, vendor\_id, description, cost,
  status (Open-Proposed / Open / In Progress / Closed),
  date\_opened, date\_closed, invoice\_ref,
  source (manual / samsara\_fault / samsara\_dvir),
  samsara\_reference\_id (nullable — links back to the fault/defect that created it)

fault\_events
  id, unit\_id, dtc\_code, dtc\_description, source (obdii/j1939),
  samsara\_reading\_time, matched\_work\_order\_id, status

dvir\_defects
  id, unit\_id, defect\_type, samsara\_defect\_id, is\_resolved,
  created\_at, matched\_work\_order\_id
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

* Preferred: configure a Fault Code alert webhook in the Samsara dashboard
(real-time push, no polling delay)
* Fallback/backfill: `GET /fleet/vehicles/stats/history?types=faultCodes` for a
date range, or `GET /fleet/vehicles/stats/feed?types=faultCodes` for continuous
polling with a cursor
* Payload gives OBD-II confirmed/pending/permanent DTCs (code + description,
e.g. "P0087" / "Fuel Rail/System Pressure - Too Low Bank 1") or J1939 fault
codes with SPN/FMI + which check-engine light is on

**DVIRs**

* `GET /fleet/dvirs/history?startTime=...\&endTime=...` for full DVIRs, or
`GET /fleet/defects/history?startTime=...\&endTime=...` for just defects
* There's also a `DvirSubmitted` webhook event for real-time triggering
* Each defect has: defectType (e.g. "Battery"), vehicle, isResolved, createdAtTime
* Can write back: `PATCH /fleet/defects/:id` or `PATCH /fleet/dvirs/:id` to mark
resolved once our work order closes, keeping Samsara's compliance record in sync

**DTC-to-category mapping**: build a lookup table (own data, not from Samsara) —
DTC code pattern -> likely part -> our category. This is what turns "P0087" into
"probably a fuel pressure sensor, tag as Engine."

## Build order (see Phase 1 / Phase 2 split above for the ops-risk rationale)

**Phase 1 — no 24/7 responsibility required:**

1. Stand up Supabase (or Azure equivalent) + migrate the data model in
2. Build the real frontend around the Company/By-Unit toggle pattern from
fleet-dashboard-full.jsx, backed by real data instead of hardcoded records
3. Add the Claude-API invoice scanner (upload receipt -> auto-fill vendor/
unit/category/cost) — validate it against the 6 real invoices above
4. Add the pattern-detection and warranty-recovery flags as real rules, not
just one-off observations

**Phase 2 — turn on only once someone/something is watching for failures:**
5. Add the Samsara fault-code webhook listener -> proposed work order
6. Add the Samsara DVIR webhook listener -> open work order
7. Payroll export — needs the target payroll system identified first (ADP,
Paycom, etc.) before this can be scoped
8. Optional: pull Alvys Trucks/Fuel/Maintenance entities in too, to reconcile
the fuel-card-commingled maintenance spend against real work orders

## Security notes

* Samsara API token and Claude API key: environment variables on the backend
only. Never in frontend code, never committed to git, never pasted into any
chat interface.
* Shared work-order data means anyone with access to the deployed app sees the
same fleet data — add real auth before this goes further than local dev.

