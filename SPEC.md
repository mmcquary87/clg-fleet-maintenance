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
  id, number, type (Truck/Trailer/Van), vin, samsara\_vehicle\_id,
  last\_odometer, last\_engine\_hours, last\_location, last\_synced\_at,
  last\_fuel\_efficiency, last\_idling\_duration\_ms

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

## ELD (Samsara) API key — getting a complete truck data + DVIR feed

"ELD" here is Samsara — they're both the ELD provider and the telematics/
maintenance platform, so it's one integration, not two.

**What "complete feed" requires, scope-wise:**
A single Samsara API token can be scoped to multiple read permissions at once.
For full truck data + DVIR visibility, request read access to:

* Vehicles (roster: unit list, VINs, make/model)
* Vehicle Stats (location, odometer, engine hours, fuel level, fault codes)
* DVIRs / Defects
Start read-only. Don't request write scopes (like defect-resolution PATCH
calls) until Phase 2 actually needs them — narrower scope = smaller blast
radius if a key ever leaks.

**Where the key gets generated:** Samsara Dashboard → Settings → API Tokens →
Create new token, select the scopes above. This is a few clicks for whoever
has Samsara admin access — doesn't require a developer.

**Where the key goes once generated:** straight into Supabase's secrets
manager (Edge Function secrets) or Azure Function's Application Settings —
never into this chat, never into a code file, never committed to git. Whoever
generates it in Samsara can paste it directly into Supabase/Azure themselves,
so it never has to pass through a third party at all.

**Two different uses for this one feed — different phases, different risk:**

* **Phase 1 (safe, no ops burden)**: periodic *pull* of vehicle roster +
stats (location, odometer, engine hours) and DVIR history to enrich unit
records in the dashboard — e.g. auto-fill current mileage instead of manual
entry, show last-known location per unit. If this sync is late by an hour,
nothing breaks, the dashboard is just slightly stale. Safe to build now.
* **Phase 2 (real-time, ops responsibility)**: *webhook* push for fault codes
and DVIR submissions that auto-drafts work orders. This is the part that
needs monitoring/alerting before it goes live, per the phasing above.

## Truck performance data (fuel efficiency, idling, engine stats)

Same Samsara token, additional scopes. This is read-only reporting data —
purely Phase 1, no automation risk at all, just richer dashboard content.

* `GET /fleet/reports/vehicles/fuel-energy` — per-vehicle fuel \& energy
efficiency report for a date range (MPG-equivalent). Scope: **Read Fuel \&
Energy** (Fuel \& Energy category).
* `GET /idling/events` — individual idling occurrences (vehicle, start time,
duration) — flags fuel wasted sitting still. Same **Read Fuel \& Energy**
scope. Note: only covers 2024 onward; older data needs a summarized report
endpoint instead.
* `GET /fleet/vehicles/stats` / `/stats/history` / `/stats/feed` — the same
vehicle-stats endpoints already listed above also carry
`fuelConsumedMilliliters` and `idlingDurationMilliseconds` alongside
odometer/engine-hours/fault codes, so a single stats pull can cover
location + fuel + idling + faults together. Scope: **Read Vehicle
Statistics** (Vehicles category).
* `GET /driver-efficiency/drivers` — driver-level eco-driving/efficiency
scoring, grouped by vehicle if useful later for a driver-behavior view.
Scope: **Read Driver Efficiency** (Fuel \& Energy category).
* `GET /fleet/hos/clocks` — per-driver current duty status plus remaining
time on each Hours of Service clock (drive, shift/on-duty 14-hour window,
cycle, 30-minute break). Confirmed the `vehicleIds`/`driverIds` query params
are silently ignored — this returns the whole fleet's clocks every call,
filtered client-side by matching `currentVehicle.id` against known units.
Powers the Tracking page's HOS-aware ETA (see
`late-load-exposure-calc-spec.md`) — without this, the board can't tell a
driver with 8 hours of drive time left from one with 8 minutes. Scope:
**Read Hours of Service** (Safety category, presumably — confirm in the
Samsara dashboard's scope picker).

**Token scope checklist for the "complete feed"** (all read-only): Vehicles,
Read Vehicle Statistics, Read Fuel \& Energy, Read Driver Efficiency, Read
Hours of Service, DVIRs/Defects. One token, one generation step in the
Samsara dashboard, all scopes selected at once.

**Where this shows up in the dashboard**: a natural fit is a third view
alongside Company and By-Unit — a **Performance** view per unit (fuel
efficiency trend, idle time, current fault codes) sitting next to the spend
view, so a fleet manager can eventually see "this unit costs more to
maintain AND runs less efficiently" in one place. Not built yet — worth
scoping as its own step once Phase 1's spend dashboard is stable.

## Build order (see Phase 1 / Phase 2 split above for the ops-risk rationale)

**Phase 1 — no 24/7 responsibility required:**

1. Stand up Supabase (or Azure equivalent) + migrate the data model in
2. Build the real frontend around the Company/By-Unit toggle pattern from
fleet-dashboard-full.jsx, backed by real data instead of hardcoded records
3. Add the Claude-API invoice scanner (upload receipt -> auto-fill vendor/
unit/category/cost) — validate it against the 6 real invoices above
4. Generate a read-only Samsara API token (Vehicles, Read Vehicle Statistics,
Read Fuel \& Energy, Read Driver Efficiency, DVIRs/Defects scopes) and
build a periodic pull to enrich unit records with live odometer/
engine-hours/location, fuel efficiency, idling time, and DVIR history —
read-only, no automation
5. Add the pattern-detection and warranty-recovery flags as real rules, not
just one-off observations

**Phase 2 — turn on only once someone/something is watching for failures:**
6. Add the Samsara fault-code webhook listener -> proposed work order
7. Add the Samsara DVIR-submitted webhook listener -> open work order
8. Payroll export — needs the target payroll system identified first (ADP,
Paycom, etc.) before this can be scoped
9. Optional: pull Alvys Trucks/Fuel/Maintenance entities in too, to reconcile
the fuel-card-commingled maintenance spend against real work orders

## Security notes

* Samsara API token and Claude API key: environment variables on the backend
only. Never in frontend code, never committed to git, never pasted into any
chat interface.
* Shared work-order data means anyone with access to the deployed app sees the
same fleet data — add real auth before this goes further than local dev.

