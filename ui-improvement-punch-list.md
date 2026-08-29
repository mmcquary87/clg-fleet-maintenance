# CLG OS — UI Improvement Punch List

Companion to SPEC.md and late-load-exposure-calc-spec.md. Covers Board,
Tracking, Work Orders, Spend, Units, and Vendors. Read the cross-cutting
standards first — they change how every page below should be built.

## Cross-cutting standards (build these first — everything else depends on them)

**Status vocabulary.** Don't invent a new five-color scheme (Red/Amber/Blue/
Green/Gray). Use the Operations Dashboard Framework's own states so the app
and the eventual Power BI KPI layer never disagree about what a color means:

* `Green` / `Yellow` / `Red` — only for a value measured against an
*approved* threshold. If no threshold is approved yet, the value is
`Pending` (the framework's actual term for this — display the number,
no color judgment).
* Neutral/gray — for workflow or availability state that isn't a performance
judgment at all: "in progress," "not tracked," "inactive." Don't force
these into the traffic-light scale.
* Never rely on hue alone. Every status pill pairs a color with a short text
label (`Late`, `At risk`, `Pending`, `Not tracked`) — no emoji, no
color-only flags. Solid pill, text label, done.

**Density.** Reduce empty space roughly 25–35% across all pages. This is an
operations tool, not a marketing dashboard — moderate density is correct.

**Red is reserved.** Navy stays the dominant action color. Red is only for
actionable exceptions (blocked, late, down) — not for routine closed
history, not for branding elements that happen to share the palette.

**Universal unit drawer.** Clicking a unit number anywhere in the app —
Board, Tracking, Work Orders, Spend — opens the same side panel: driver,
location, mileage, open work orders, spend history, HOS, load, maintenance
history. One component, reused everywhere, not a per-page reimplementation.

**One question per page.** Each page should have a single, unambiguous job:

|Page|Question it answers|
|-|-|
|Board|What requires action right now?|
|Tracking|Which trucks may fail service?|
|Work Orders|What repairs are outstanding?|
|Spend|Where is maintenance money going?|
|Units|What is the condition/history of each asset?|
|Vendors|Who should we use to repair it?|

## Board

* Reduce header height \~20–25%.
* Replace top metrics with four compact KPI tiles: `Idle Now` /
`Cost of Waiting Today` / `Awaiting CLG Decision` / `Back on Road Today`.
**Cost of Waiting Today is gated** — see "Needs a decision first" below.
Show it as `Pending` until that's resolved, not a hard number.
* Rename "Waiting on You" → `CLG Action Required` (organizational framing,
not pointed at one person).
* Expand the urgent-issue card pattern (the 3307-style card) with:
estimated downtime cost, repair amount, current location, load impacted
(yes/no), driver name, and an action button labeled with the actual
amount — `Approve $567.50`, not a generic `Authorize`.
* Collapse minor/routine issues into compact single-line rows.
* Use the right-side panel for a single summary line, e.g.:
`2 trucks down · $1,840 at risk · 2 decisions blocking release · 1 back today`

## Tracking

Depends on late-load-exposure-calc-spec.md being implemented first — the
column below only works once real projected-arrival data exists.

* Default view is a dense table, not cards. Cards can be an optional
secondary view, not the default for 30+ units.
* Columns: `Unit | Driver | Current Location | Destination | ETA | Appt | ETA Cushion | HOS | Miles Remaining | Status`
* **ETA Cushion is the single most important column** — and it's the same
number as `hoursShort` from the calc spec, just signed instead of
clamped at zero:

  * `bufferHours > 0` → display `+1h 34m` (green)
  * `hoursShort > 0` → display `-11h 58m` (red)
One field, one pill, replaces the old prose sentence entirely.
* Separate `No appointment on file` from `On track` — that's a
data-quality gap, not a good status, and shouldn't share a color with
genuinely on-pace loads.
* Add filters: `Late risk | HOS risk | No appointment | No GPS | Delivering today | Delivering tomorrow`
* Collapse the 55mph/Samsara/Google-routing disclaimer into a small ⓘ
tooltip — it shouldn't occupy a quarter of the header.

## Work Orders

* Consolidate the filter row to one line: `Search | Date Range | Status | Category | Severity | Vendor`. Show filter chips only after a value is
selected — don't front-load all the chrome.
* Freeze the table header on scroll.
* Make the entire row clickable, not just a button inside it.
* Add `Age` (e.g. `3 days`) as its own visible column, separate from
`Downtime`.
* Move dollar amounts next to severity/status so cost and urgency read
together.
* Add `Assigned To` and `Load Impacted` columns.
* Make `Needs Approval` visually unmistakable. Don't use red for routine
closed history — that's the cross-cutting red-reservation rule applying
here specifically.
* Fix parent/child hierarchy where one incident produces multiple entries
(e.g. two 3307 rows). Structure as one parent work order with child
invoice/service-event rows underneath, so it's never ambiguous whether
the same issue was logged twice.
* Add four mini KPIs at the top: `Open | Awaiting Approval | Units Down | Open Repair $`

## Spend

* Top section becomes: `YTD Maintenance Spend | Cost/Truck | Cost/Mile | Unscheduled Repair % | PM Compliance | Downtime Cost`
* Split every figure by `Tractors | Trailers | All Equipment`. The current
blended `Avg/Unit $4,292` is misleading — tractors and trailers have
different economics and shouldn't be averaged together.
* Spend by category: horizontal bar chart, sorted highest → lowest.
* Spend by vendor: ranked table + bar combo, columns `Vendor | Spend | Jobs | Avg Ticket | Units | % Fleet Spend`.
* **Deferred, not a v1 layout task:** anomaly surfacing ("tire spend up 18%
vs. trailing 90-day average," "unit 3307 is 2.3× fleet average"). This
needs a defined baseline methodology and enough historical data before
it's a real feature — building the UI for it before the math is decided
just produces confident-looking noise. Track separately.

## Units

* Denser roster columns: `Unit | Type | Year/Make | VIN | Driver | Location | Mileage | Maintenance Status | Next PM | Status`
* Fix "Not Tracked" showing on nearly every trailer — either wire trailer
telematics or suppress/deemphasize the field until that data exists.
A field that's always empty is noise, not information.
* **Unit Detail page — route through Claude Design first, not straight to
code.** This page doesn't exist yet and has real open layout questions
(tab order, what's above the fold, how dense the summary block can be).
Worth seeing two or three directions before committing:

  * Header: unit number, year/make/model, current mileage
  * Tabs: `Overview | Maintenance | Spend | Work Orders | Tires | Inspections | Documents | History`
  * Summary block: YTD maintenance $, cost/mile, last PM (miles ago),
next PM (miles remaining), open issues, days down YTD, driver,
current GPS location

## Vendors

* Restructure from an address book into a repair-network view:
`Vendor | City/State | Specialty | Jobs | YTD Spend | Avg Invoice | Avg Downtime | Last Used | Rating`
* Vendor detail view: preferred-vendor badge, specialty tags (Tire / PM /
Road Service / DOT Inspection), CLG history stats (repair count, total
spend, avg invoice, avg turnaround, last used), contact info, hours,
after-hours number.
* **Normalize duplicates before anything else on this page matters.**
Variants like `Fleet Pride` / `FleetPride` / `Love's` / `loves` will
silently corrupt every spend rollup above. Create one canonical vendor
record with individual locations nested underneath, and migrate existing
work-order/invoice references to point at the canonical record.

## Needs a decision before building (not a coding task)

* **Cost of Waiting Today** (Board tile) — depends on Revenue per Active
Tractor per Week, which the framework marks `Pending Activation` with no
Finance-approved target yet. Don't ship a confident dollar figure ahead
of that approval; show `Pending` instead.
* **ETA Cushion / hours-short severity cutoffs** — already flagged as
draft in late-load-exposure-calc-spec.md; needs Ops/Safety sign-off.
* **Spend anomaly thresholds** — needs a baseline methodology (see Spend
section above) before any UI is built around it.

## Suggested build order

1. Cross-cutting status-pill system and universal unit drawer (everything
else references these).
2. Tracking (after the hours-short calc lands).
3. Board.
4. Work Orders.
5. Spend (excluding anomaly detection).
6. Vendors, including the normalization pass.
7. Units roster density.
8. Unit Detail page — after a Claude Design exploration pass.

## Handoff note

Drop this file into the project folder next to SPEC.md and
late-load-exposure-calc-spec.md. Suggested prompt for Claude Code:

> Read ui-improvement-punch-list.md, SPEC.md, and
> late-load-exposure-calc-spec.md. Start with the cross-cutting standards
> section (status-pill system, universal unit drawer), then work through
> the pages in the suggested build order. Flag anything in the "needs a
> decision first" section rather than guessing at a default.

