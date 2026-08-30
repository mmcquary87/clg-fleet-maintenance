# CLG OS — Maintenance Software Design Package

Design handoff for **Claude Code**. Point Claude at this README first.

## What this is

A designed front end for CLG's fleet maintenance platform, covering seven screens of the
existing `clg-fleet-maintenance` app. It is a **design reference built in HTML** — intended
look, structure, copy, and behavior — **not production code to copy directly.**

Recreate these designs in the target codebase's own environment (its framework, component
library, router, and state management). If the repo already has these routes, restyle and
restructure them to match; do not fork a parallel implementation.

## Read the design like this

- `design/CLG OS.dc.html` — **the authoritative source.** All seven screens with working
  navigation. Uses a custom streaming-template runtime (`support.js`) — **do not port that
  runtime.** Read it for layout, values, and copy only.
- `design/CLG-OS-standalone.html` — the same thing as one self-contained file. Open it in a
  browser and click through the nav. Easiest way to understand the flows.
- `screenshots/` — one PNG per screen, for orientation. **The HTML wins** on exact values.

## Fidelity

**High-fidelity.** Colors, type, spacing, and copy are final and brand-exact — recreate them
precisely using the codebase's existing primitives.

Two caveats:
1. **Static.** Nav switches screens; nothing else is wired. No data fetching, no form state, no
   real mutations. Interactions below are intent.
2. **Sample data is real-shaped but not live.** Units 3307 and 4212, vendors Suburban Towing and
   River City Truck Center, WO numbers WO-1041/1038/1034/1029/1024. Match the shape, pull the
   values from the API.

---

## The design argument (read before building)

Three decisions drive every screen. If you keep the visuals but drop these, the design stops
working:

**1. The unit is the object, not the ticket.** A work order is a child record of a truck. The
board is a list of *idle trucks*; the manager never has to translate "WO-1041" back into
"3307 is stuck at Suburban." Work-order pages exist, but they are reached *through* the problem.

**2. Status names the blocker and its owner, not a lifecycle stage.** Lanes are
*Waiting on you*, *At a vendor*, *Waiting on parts*, *In the bay* — never "Pending" or
"In progress." A card says "Suburban Towing is waiting on your authorization to start," not
"Awaiting vendor." The board triages itself because every item is filed under the thing that
has to happen next and the person who has to do it.

**3. Urgency is time and money, not a severity dropdown.** Priority fields get gamed — everything
becomes P1. A live idle clock and an accrued dollar figure can't be argued with. Sorting is by
cost of waiting. **Do not add a user-assigned priority field or drag-to-prioritize** — it
reintroduces exactly the problem this design removes.

### Attention comes from layout, not color

The board splits **46 / 54**. The lane you own ("Waiting on you") takes the left side with its
top item fully expanded; the three lanes you only monitor share the right as compact stacks.
Because hierarchy is structural, **Scarlet appears exactly once per screen** — the 3px top rule
on the card that needs a decision. Everything else is navy, blue-grey, and white.

### Honest empty and blocked states

This is the detail most likely to be "simplified" away. Don't.

- **Cost of waiting shows an em-dash, not \$0.** Two trucks are idle; \$0 would be a lie. The
  metric states *why* it can't compute ("can't compute yet") and links to the missing input
  ("Set an hourly revenue rate").
- **Authorize is disabled when there is nothing to authorize**, with the reason inline:
  "Unlocks when Suburban sends a number." The primary action becomes *Chase the estimate* —
  the thing that is actually blocked. Never show an enabled Authorize with no estimate on file.
- **Empty lanes say it once, plainly** — "Nothing at a vendor." The same sentence repeated in
  three columns reads as boilerplate. The observation about empty lanes being good news appears
  once, in a single card at the bottom, and it names the real finding: both items sit in the
  manager's own lane, so the bottleneck is authorization, not shop capacity.
- **Two units is a small fleet, and the design says so** rather than faking dashboard density —
  Units notes that availability isn't a useful number at this size; Spend notes 4212's
  cost-per-mile isn't comparable yet.

---

## Screens

Nav order matches the live app: Board · Tracking · Operations | Work orders · Spend · Units ·
Vendors | Roster · Home time.

### 1. Board — `screenshots/01-board.png`
The home screen. Idle count and cost-of-waiting as two large figures, then the 46/54 lane split.

- Left: lane header (`WAITING ON YOU`, Ruby, tracked caps) + count line. The top card is
  expanded: unit number at 26px, blocker sentence at 21px Montserrat Regular, two Smoke stat
  tiles (Estimate / Idle so far), then the action row. Below it, remaining items collapse to
  single grid rows (`90px 1fr 92px 66px`).
- Right: three monitored lanes as a 3-col grid of compact stacks, then a full-width row holding
  the navy "back on the road today" card and the closing observation card.
- Clicking either open item opens the work order.

### 2. Work orders — `screenshots/02-work-orders.png`
Full list, filter pills (Open 2 · Closed 4 · All 6), one table.
Grid `110px 92px 1fr 230px 200px 108px 78px`; header row on Smoke in tracked 10.5px caps.
Note the **BLOCKED ON** column — it carries "Your authorization," not a status word. Closed rows
drop to Pewter/Cool so open work is the only thing with contrast.

### 3. Work order detail — `screenshots/03-work-order-detail.png`
Breadcrumb, then a header with severity Badge, 50px unit number, and the idle clock in Ruby.
Body is `1fr / 360px`:
- **"The one thing blocking this truck"** card (3px Scarlet top rule) — the blocker stated as a
  sentence, two stat tiles (estimate requested 2 days ago vs. a 6-hour vendor average; tow
  already billed \$685), then actions: *Chase the estimate* (primary), *Move to another vendor*
  (outline), *Authorize repair* (disabled, with reason).
- **"Where the 52 hours went"** — idle time attributed to phases, closing with "85% of this
  truck's downtime is a vendor not replying. That's a vendor-management problem, not a shop
  problem." This attribution is the core of the product; keep it.
- **Activity** feed with a composer.
- Rail: the unit (links to Unit detail), vendor scorecard with a judgment ("Slowest estimate
  they've sent you. Worth a call rather than another email."), YTD spend.

### 4. Units — `screenshots/04-units.png`
Auto-fill card grid, `minmax(320px,1fr)`. Each card: unit number 28px, `critical` Badge, a
plain-language status sentence, then a 2×2 metadata grid (odometer, last PM, spend YTD, idle).
Closes with the note about availability not being meaningful at two units.

### 5. Unit detail — `screenshots/05-unit-detail.png`
Header with three figures (idle, spend YTD) and the badge. Body `1fr / 360px`:
open-work card (Scarlet rule, links to the WO), repair history table, and a rail with PM status
(4,120 miles to next, 84% bar, plus the useful suggestion to have Suburban do the PM while the
truck is already on their lot), an Alvys placeholder card, and a navy cost-per-mile card.

### 6. Vendors — `screenshots/06-vendors.png`
A **scoreboard, not a directory.** Cards at `minmax(360px,1fr)`; the vendor who owes you
something gets the Scarlet rule and a Ruby "Owes an estimate" label. Each card carries three
metrics (jobs YTD, spend YTD, avg estimate/turn) and a Smoke box with the actual judgment —
"Good on towing, slow on repair quotes. Consider using them for recovery and sending the repair
elsewhere." The closing card states the page's thesis: the two numbers that decide where a truck
goes next are quote speed and promise-hit rate.

### 7. Spend — `screenshots/07-spend.png`
**The most developed screen in the package, and the one with the most opinion in it.** Built
against a real export: 174 units, 169 with spend, 1,000 invoices, $725,405 total.

Structure, top to bottom:

1. **Scope tabs** (Company / By unit / Vendors / Deductions) + `Log invoice`, then a period row
   (Today · This week · This month · **This quarter** · YTD · All time · Custom) with a
   `vs. prior quarter` comparison label. **Default to a bounded period, not All time** — the
   manager's real question is "is this getting worse," which an all-time total cannot answer.
2. **Three headline figures.** Cost per mile is the hero ($0.191) with a Ruby delta arrow and a
   target; then total spend; then **unplanned share (79%)**. Deliberately *not* average spend per
   unit — an average across 174 units hides every outlier that matters.
3. **"Read this first" card** (the screen's one Scarlet rule). A third of spend — $240,182 across
   331 invoices — is categorized `Other`, larger than the biggest real category. The card states
   the consequence ("every number on this page is directional at best"), shows the percentage with
   a Ruby bar and its trend ("was 11% two quarters ago"), and offers the actual fix:
   `Code 331 invoices` (primary) and `Auto-code by vendor` (quiet), with the reason one rule is
   enough — most are Speedco line items.
4. **Spend by category** — horizontal bars in a `132px / 1fr / 92px` grid, so labels and dollars
   can never collide. Planned categories (DOT inspection, PM/oil) render in Navy, reactive ones in
   Royal, and `Other` in Mercury so it reads as absent data rather than a real category. Closes
   with a judgment: tires at 28% of coded spend is high, and may be road-service calls at retail
   rather than planned replacements at contract price.
5. **Spend by vendor** — same bar treatment, with `road service` / `recovery` tags in Ruby on the
   roadside vendors. Closing line does the arithmetic the manager cares about: **58% of spend
   ($420,715) is road service and recovery bought at retail, versus 7% in-house.**
6. **"The units costing you most"** — worst offenders by cost per mile, with a *what's driving it*
   column (not just an amount) and a **call** column: Retire / Watch / Comeback. Two units cost
   more per mile than a lease payment. Rows link to unit detail.
7. **"Needs a human"** — the work queue: 331 uncategorized, 178 missing an odometer reading (their
   CPM is a guess), 24 invoices over the authorized estimate, 12 off-list vendors, 9 possible
   duplicates. Each row has a verb (Code / Fill in / Dispute / Review / Compare). Ends with the
   navy card: **$27,600 recoverable** if the list is worked.

**The principle to preserve:** this page is designed to be *worked*, not looked at. Every block
ends in either a judgment or an action, and any figure that cannot be honestly computed says so
instead of rendering a zero. If you reduce this to four KPI tiles and two charts, the design's
value is gone.

**Data requirements this screen exposes** (both currently missing — see Open questions): miles per
unit per period, without which cost per mile is fiction; and a PM interval per unit, without which
planned-vs-reactive cannot be computed.

### Tracking · Operations · Roster · Home time
**Deliberately blank**, each showing a "Not designed yet" card that says so and invites a brief.
I did not invent these screens because I don't know what they answer. Do not fill them with
placeholder dashboards — get the brief first. (See Open questions.)

---

## Interactions & behavior

**Navigation.** Single-page; nav item switches screen. Active nav = Navy text, 600 weight, 2px
Navy underline (`box-shadow: inset 0 -2px 0`). Work orders and Work order detail share an active
state; likewise Units and Unit detail. Logo returns to Board.

**Drill-in.** Board card → work order detail. Table row → work order detail. Unit card → unit
detail. WO rail "OPEN" → unit detail. Breadcrumbs return.

**The idle clock.** Starts when a unit is marked unable to move a load; stops when it returns to
service. Compute client-side from a start timestamp — never store an elapsed number. Ticks live.

**Cost of waiting.** `idle hours × unit hourly revenue rate`. With no rate configured, render
the em-dash state and the link to set one. Never render \$0.

**Estimate → authorization.** An estimate is required before Authorize enables. Approving mints
the PO number. A revised estimate above the approved amount returns the item to the manager's
lane. Assumed threshold: **≤ \$500 auto-approves, above that a manager authorizes** — make it a
configurable setting, not a constant.

**Vendor chase.** "Chase the estimate" should log an activity entry and timestamp, so the ledger
can show 44 hours against a 6-hour average. Vendor stats (avg estimate turnaround, promise-hit
rate) derive from these timestamps — they are the reason to capture them.

**Transitions.** 120/180/280ms, `cubic-bezier(.2,.7,.3,1)`. Fades and short translations only —
no bounce, no spring, no scale-down on press. Hover shifts to the adjacent brand color
(Scarlet→Ruby primary, Royal→Navy secondary, Ruby→Scarlet links); quiet controls take a Smoke
wash. Focus: 3px Royal ring at 35%. Disabled: Moon background + Cool text, never opacity.

**Responsive.** Desktop-first. The board's 46/54 split and the 3-col monitored grid are the
breakpoint risk — below ~1100px collapse to one column with lane names as sticky section
headers. Card grids already use `auto-fill minmax()`.

## State / data model

- `units[]` — number, model, odometer, domicile, lastPM, hourlyRevenueRate (nullable), status.
- `workOrders[]` — unitRef, issue, source, canMoveLoad (bool), vendorRef, estimate (nullable,
  line items), approvalState, poNumber, promisedBack, invoice, activity[], openedAt/closedAt.
- `vendors[]` — name, jobsYTD, spendYTD, avgEstimateHours, avgTurnDays, promiseHitRate.
- **Derived, never stored:** idle duration, accrued cost of waiting, lane assignment (computed
  from the blocker), cost per mile, board sort order.
- `approvalThreshold` — a setting.

Lane assignment is a function of the blocker, not a field a user sets. `Waiting on you` =
needs authorization or a decision. `At a vendor` = authorized, vendor holds the unit.
`Waiting on parts` = parts on order. `In the bay` = work in progress in-house.

## Design tokens

Use the design system's CSS custom properties, not these literals. Hexes listed so the source
is readable.

**Primary:** Royal `#1155A1` (`--clg-royal`) · Navy `#223B62` (`--clg-navy`) ·
Scarlet `#EB2127` (`--clg-scarlet`) · Ruby `#BE202E` (`--clg-ruby`)

**Neutrals** — all blue-greys; never introduce a warm or pure grey:
Granite `#485767` · Pewter `#5A6D80` · Cool `#7A8B99` · Mercury `#A3BACB` ·
Moon `#BFD3E1` · Reflection `#DAE7F1` · Smoke `#E7EDF1` · White `#FFFFFF`

**Roles as used here:**
- Page background Smoke; cards white; stat tiles and inset panels Smoke.
- Headings and figures Navy. Body Granite. Secondary Pewter. Tertiary/meta Cool. Absent
  values Mercury (the em-dash, "Not in yet"). **Pure black is not a brand color.**
- Ruby: the idle clock, the "waiting on you" lane label, links, "owes an estimate."
- Scarlet: **once per screen** — the 3px top rule on the decision card. Also the primary button.
- Navy backgrounds: exactly one card per screen (the summary/cost-per-mile card), always with
  the star mark bleeding off the bottom-right at `opacity:.07`.
- Links: Ruby at rest → Scarlet on hover.

**Type:** Montserrat (`--clg-font-heading`) for headings, figures, unit numbers, and tracked
caps labels; Poppins (`--clg-font-body`) for body. Page titles 34px Montserrat **Regular**
(not bold) with `letter-spacing:-.015em`. Headline figures 44–56px Bold, `-.02em`. Unit numbers
19–28px Bold. Body 13.5px. Meta 12.5px. Tracked caps labels 11–12px at `letter-spacing:.13–.16em`,
uppercase. Section labels are Montserrat 700 at 11.5–12px.

**Elevation over borders.** This is the biggest departure from the previous build. Cards are
separated by shadow and gap, not hairlines:
- Resting card: `0 1px 2px rgba(34,59,98,.06)`
- Raised card: `0 1px 2px rgba(34,59,98,.06), 0 6px 20px rgba(34,59,98,.07)`
- Focus card (the decision): `0 1px 2px rgba(34,59,98,.07), 0 8px 26px rgba(34,59,98,.09)`
- App bar: `0 1px 0 rgba(34,59,98,.08)`
Hairlines survive only *inside* a card, as `1px solid var(--clg-smoke)` row dividers.

**Radii:** 4px on cards, tiles, and buttons. 999px only for filter pills and status dots. 2px on
bar-chart bars and activity bullets.

**Spacing:** 4px base. 26px page padding, 18–26px grid gaps, 20–24px card padding, 14–16px inside
tiles.

## Components used from the design system

Mount these rather than restyling raw HTML:
- **Button** — `primary` (Scarlet; one per surface), `secondary` (Royal), `outline`, `quiet`,
  `inverse` (on navy). Sizes `sm`/`md`/`lg`. **`ghost` is not a variant.**
- **Badge** — `critical` / `brand` / `neutral`.
- Available and appropriate as you build out: Card, Table, StatBlock, Alert, Divider,
  Field/Input/Select/Checkbox/Radio/Switch, Link, Icon, Logo, StarMark, Eyebrow.

The disabled "Authorize" is intentionally *not* a Button — it is a Moon-filled span, per the
brand's "disabled = Moon background + Cool text, never opacity" rule. Implement it as a
genuinely disabled button in code.

## Assets

- `_ds/.../assets/mark-star.svg` — royal-contrast star, for light surfaces (app bar, 26px).
- `_ds/.../assets/mark-star-white.svg` — white-contrast star. Used at 158px, `opacity:.07`,
  bleeding off the bottom-right of navy cards. **This cropped oversized star is the brand's
  signature empty-space device — keep it.**
- Fonts: Montserrat + Poppins. `tokens/fonts.css` ships the Regular weights locally;
  **Montserrat Bold and the Poppins italic/bold faces load from Google Fonts — self-host them
  in production.**
- No brand UI icon set exists. The design system wraps **Lucide** as a documented substitution;
  use its `Icon` component so a real CLG set can be swapped in one place. **No emoji, ever.**

## Copy guidance

Plain, declarative, operational. Short sentences, no hedging, no superlatives, no startup
register. Tracked uppercase for labels; sentence case for everything else.

Three habits worth preserving verbatim in spirit:
1. **Name the blocker and its owner.** "Suburban Towing hasn't sent an estimate" beats
   "Awaiting vendor estimate."
2. **State the consequence next to the action.** "Unlocks when Suburban sends a number."
   "Clock starts now, load gets flagged for reassignment."
3. **Let the interface draw the conclusion.** "85% of this truck's downtime is a vendor not
   replying. That's a vendor-management problem, not a shop problem." A number without an
   interpretation makes the user do work the software could have done.

Show real identifiers — unit 3307, WO-1041, PO 4471. Never lorem.

## Open questions for the product owner

1. **Tracking, Operations, Roster, Home time** — four nav sections, no brief. What does each
   answer? They are blank on purpose until then.
2. **Hourly revenue rate per unit** — cost of waiting can't compute without it. Does Alvys
   expose one, or is it a fleet-wide constant?
2b. **Miles per unit per period** — the Spend page's cost-per-mile is the headline metric and
   cannot be computed without it. 178 invoices currently carry no odometer reading.
2c. **PM interval per unit** — needed for the planned-vs-unplanned split (79% unplanned) and for
   PM compliance on unit detail.
3. **The \$500 approval threshold** and auto-approve below it are my assumption. Confirm the
   number and whether it varies.
4. **Alvys integration status** — driver, trip, location, VIN, trailer, and warranty are shown
   as placeholders. Which fields are live today?
5. **Not designed:** intake/create flow in this style, PM schedule, parts inventory, technician
   mobile view, invoice reconciliation, settings/approval rules, and any multi-tenant SaaS
   surface (org switcher, roles, white-label theming).

## Files

```
CLG-OS-Design-Package/
  README.md                        ← this file
  design/
    CLG OS.dc.html                 ← authoritative source, all 7 screens
    CLG-OS-standalone.html         ← same, self-contained; open in a browser
    support.js                     ← template runtime; reference only, do not port
    _ds/capital-logistics-.../     ← design system: tokens/*.css (authoritative token
                                     values), styles.css, _ds_bundle.js (Button, Badge,
                                     + 17 more), assets/
  screenshots/                     ← 01–07, one per screen
```
