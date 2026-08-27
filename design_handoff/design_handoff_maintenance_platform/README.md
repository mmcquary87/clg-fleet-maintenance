# Handoff: CLG Maintenance & Work Order Platform

## Overview
An internal (eventually multi-tenant SaaS) maintenance platform for Capital Logistics Group's
tractor and trailer fleet. It ingests work orders from the **Alvys** TMS API, allows manual
intake, routes repairs to in-house bays or approved outside vendors, and gates vendor spend
behind manager approval.

Primary users: **maintenance manager** (triage, approval, vendor management) and
**dispatch/ops** (report an issue, check status). Desktop first.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended
look, structure, and behavior. They are **not production code to copy directly.**

The task is to **recreate these designs in the target codebase's existing environment** (React,
Vue, SwiftUI, native, whatever is already in place) using its established patterns, component
library, and state management. If no environment exists yet, choose the most appropriate
framework for the project and implement the designs there.

`Work Order Platform.dc.html` is a single-file design board containing all screens side by side
on a pan/zoom canvas. Each screen is a labelled block (`#1a`, `#2b`, etc.) — those ids are the
canonical names used throughout this document. The file uses a custom streaming-template runtime
(`support.js`); **do not port that runtime**. Read the markup for layout and values only.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final and brand-exact. Recreate the
UI pixel-accurately using the codebase's existing libraries.

Two exceptions:
1. **Static mockups.** Nothing is wired. There is no routing, no data fetching, no form state.
   Interactions described below are intent, not implemented behavior.
2. **Two competing directions.** Turn 1 and turn 2 are *alternative products*, not two halves of
   one. Pick one before building (see "Two directions — pick one").

---

## Two directions — pick one

### Turn 1 — work-order-centric (`#1a`–`#1e`)
The **work order** is the primary object. Screens are a queue of WOs, a WO detail page, an intake
wizard, and a KPI dashboard. Statuses are lifecycle stages (Reported → Estimated → Awaiting
approval → In repair → Invoiced & closed). Urgency is a three-value severity field
(Unit down / Urgent / Routine). The manager's home screen is an **approval inbox**.

Safer, more conventional, closer to how off-the-shelf fleet maintenance software works.

### Turn 2 — unit-centric, "downtime clock" (`#2a`–`#2c`)
The **unit (truck)** is the primary object; a work order is a child record. Board columns are
named after the **blocker**, not the stage: *Waiting on you*, *Waiting on a vendor*, *Waiting on
parts*, *In the bay*. Every idle unit carries a live idle timer and an accrued
cost-of-waiting dollar figure; sorting is by cost of waiting rather than by a
human-assigned priority. Intake asks one urgency question: "Can it move a load right now?"

More opinionated. Requires an hourly revenue rate per unit to compute cost of waiting.

**Recommendation:** build turn 2's board and unit page, and keep turn 1's approval inbox
(`#1c`) as a secondary view for managers who want a flat list. The two are compatible if the
unit is the canonical object and the WO list is a filter over it.

---

## Screens / Views

### `#1a` — Intake, guided (3 steps)
**Purpose:** dispatch or shop creates a work order in a stepped flow.
**Layout:** 1240×800. Fixed 212px navy left sidebar; main column = header bar (72px), step
indicator strip (background Smoke, 3 equal flex items), then a two-column body
(`flex:1` left / 320px right rail) with 32px gutter, 28px padding.
**Components:**
- Sidebar: star mark 26px + `CLG SHOP` (Montserrat 700, 12px, letter-spacing .14em, white).
  Nav items 10px/20px padding, 12.5px, Mercury; active item white on `rgba(255,255,255,.08)`
  with a 3px Scarlet left border. Footer block: Alvys sync status, 11px, Cool/Moon.
- Step indicator: 22px square badges — done = Royal fill + white check; current = Scarlet fill;
  future = 1px Mercury border, Cool text.
- Source chips: 8px/14px padding, 12.5px. Selected = 1px Royal border, `rgba(17,85,161,.07)` fill,
  Royal text. Unselected = 1px Reflection border, Pewter text.
- Severity cards: 3 across, 10px gap. Selected = 2px Scarlet border + `rgba(235,33,39,.05)` fill,
  title in Ruby. Titles Montserrat 700 13px; sublabel 11.5px Pewter.
- Right rail unit card: **Navy background**, 20px padding. Unit number eyebrow (Mercury 10px
  tracked) + `FROM ALVYS` marker; model in Montserrat 700 26px white; 2-col metadata grid
  (10.5px Cool labels / 12px white values), 12px/16px gaps, divided by a
  `rgba(255,255,255,.16)` hairline.
- Warranty hint: Smoke fill, 4px Royal left border, 12px Granite copy.
- Photo slots: 74×54, Reflection fill, 1px Mercury; the add slot is 1px dashed Mercury with
  Royal text.
**Buttons:** `Save draft` (outline, sm) + `Continue` (primary, sm) top right.

### `#1b` — Intake, single screen
**Purpose:** the whole work order captured without scrolling or a Next button.
**Layout:** 1240×800. Top navy app bar (56px) with horizontal nav; page title row; then a
**2-column equal grid** (26px gap) — left = unit lookup + Alvys data table + duplicate warning;
right = severity, source/system selects, complaint textarea, vendor panel. Sticky footer bar
(16px/28px) with the submit action.
**Components:**
- Unit lookup: Smoke panel, 1px Mercury. Input 1px Royal border, 14px 600 Navy. `Pull from Alvys`
  secondary button beside it. Helper line 11.5px Pewter with a link to manual entry.
- Alvys data table: bordered box; header row Smoke fill with `FROM ALVYS` (Montserrat 700 11px,
  tracked .14em, Navy) + sync timestamp. 2-column cell grid, 12px/16px padding, 1px Smoke
  dividers; 10.5px Cool tracked labels above 13px Navy values.
- Duplicate check: 4px Scarlet top rule, 12px Granite copy, inline link to the existing WO.
- Vendor panel: Smoke fill; header row with an In-house / Vendor segmented toggle (active =
  Royal fill, white); 2×2 field grid — approved vendor select, estimate, PO/authorization,
  promised-back. Below it an approval warning: `rgba(235,33,39,.07)` fill, 4px Scarlet left
  border, naming the approver.
**Footer:** left = consequence text ("unit 3303 will show **Out of service**", Ruby bold);
right = `Cancel` (outline) + `Create work order` (primary).

### `#1c` — Queue, approval-first
**Purpose:** manager's morning triage. Opens on what needs their signature.
**Layout:** 1240×880 on Smoke. App bar; page header (H1-scale question as the title); 4-up KPI
card row (14px gap); then a full-width table card filling remaining height.
**Components:**
- KPI cards: white, 1px Reflection, 16px/18px padding. Number Montserrat 700 34px. The first card
  carries a 4px Scarlet top rule and a Ruby number — it is the only accented card.
- Table card: tab strip (Needs approval / Open / At vendor / Closed) with active tab in Navy 600
  and a 2px Scarlet underline; filter pills right-aligned, 1px Reflection.
- Table grid: `96px 1fr 132px 190px 118px 92px 120px`. Header row Smoke fill, Montserrat 700
  10.5px, letter-spacing .12em, Pewter. Rows 15px/20px padding, 1px Smoke bottom border. The
  top-priority row has a `rgba(235,33,39,.04)` tint.
- Row content: WO number in Royal 600; unit + issue in Navy 600 with an 11.5px Cool context line
  (location, driver, warranty note); severity **Badge**; vendor; estimate in Navy 600; age.
- Row action: `Approve` (primary, sm) on the top row only; `Review` (outline, sm) elsewhere.
- Footer: result count left, "Approve all under $500 automatically →" in Royal, right.

### `#1d` — Work order detail
**Purpose:** the approve/decline decision, with the estimate above the activity log.
**Layout:** 1240×1010 on Smoke. App bar with breadcrumb; a white header block (22px/28px)
containing severity badge + provenance line, H-scale title, unit metadata line, header actions,
and a **5-node horizontal stage tracker**; then a `1fr / 380px` body grid, 22px gap.
**Components:**
- Stage tracker: 9px square nodes joined by 2px connector rules. Completed nodes/rules Royal;
  current node/incoming rule Scarlet with Ruby label; future nodes/rules Reflection with Cool
  labels. Labels 11.5px, 600 when reached.
- Estimate card: header row with vendor name (tracked caps) + received time; line-item grid
  `1fr 90px 110px`, 11px rows, 1px `#F0F5F9` dividers; total row with Montserrat 700 17px figure.
  Footer strip `rgba(17,85,161,.06)` with the warranty-recovery note and an inline link.
- Activity feed: 8px square bullets (newest Scarlet, rest Mercury), 13px gap, title in Navy 600
  and a 12px Cool meta line (actor · time · detail). Sticky composer at the bottom: input +
  `Post` (secondary).
- Right rail, top to bottom: downtime card (4px Scarlet top rule, Ruby 32px figure, revenue at
  risk), vendor card (contact, distance, avg turn, YTD count, `Call` + `Change vendor`),
  Alvys read-only grid, and a YTD spend card ending in cost-per-mile.
**Header actions:** `Decline` (outline) + `Approve $1,240 & issue PO` (primary) — the dollar
figure is in the button label deliberately.

### `#1e` — Dashboard
**Purpose:** fleet health framed as decisions, not charts.
**Layout:** 1240×880. App bar with terminal selector; a **navy hero band** (30px/28px) with an
oversized star mark bleeding off the bottom-right at `opacity:.07`; then a `1.35fr / 1fr` grid.
**Components:**
- Hero: three metric groups (availability 94.2%, units down 3 in Scarlet, cost per mile $0.132)
  in Montserrat 700 52px white, each with a 12.5px Moon caption. Right side: a 4px Scarlet
  left-border callout naming the pending approval total, with a `Review approvals` primary button.
- "Down right now" list: grid `70px 1fr 130px 96px`, 13px rows, Ruby bold duration.
- Vendor spend bars: 9px track in Smoke; fills Royal / Navy / Pewter / Scarlet (roadside is the
  Scarlet one). Label + amount row above each. Closing insight in a Smoke box with a 4px Royal
  left border.
- PM compliance card: 40px figure, 88% bar, plan CTA (`Build next week's PM plan`, outline).
- "Where work comes from" list: source vs. percentage rows; closing 12px Pewter observation.

### `#2a` — The board (turn 2)
**Purpose:** every idle unit filed under the name of what is blocking it.
**Layout:** 1240×1010 on Smoke. 56px app bar; navy status band (26px/28px) with idle count,
cost-of-waiting total, and a Scarlet-bordered framing note; then a **4-column grid with 1px gaps
over a Moon background** (the gap *is* the divider). Each column: white sticky header
(16px/18px) + a `overflow-y:auto` card list at 14px padding, 12px gap.
**Components:**
- Column header: Montserrat 700 11.5px, letter-spacing .13em. Only "Waiting on you" gets a 4px
  Scarlet top rule and a Ruby title; the others take a Smoke top rule and a Navy title. Subline
  12px Pewter states count + accrued dollars + who is blocking.
- Unit card: white, 1px Moon, 15px/16px. Unit number Montserrat 700 19px Navy on the left; idle
  duration Montserrat 700 17px on the right — **Ruby past ~24h, Pewter under**. Then issue title
  (12.5px Navy 600), context line (11.5px Cool), a 1px Smoke divider, and a 12px Granite sentence
  naming the specific blocker with the dollar figure in Navy bold. Action row: one sm button
  (`Authorize` primary / `Chase vendor` outline / `Free the bay` outline) plus an optional
  11.5px Royal text link. The lead card also carries a burn-rate line ("$117/hr to keep thinking
  about it").
- Lower-priority cards drop the divider, the blocker sentence, and the buttons — 14px padding,
  17px unit number, one 12px summary line.
- In-the-bay cards carry a 6px Smoke progress track with a Royal fill (hours logged / estimated).
- Empty-lane placeholder: 1px dashed Mercury, 12px Pewter — states that an empty lane is good news.
- Column 4 ends with a **navy summary card**: "BACK ON THE ROAD TODAY", 30px white figure, median
  idle time trend.

### `#2b` — Unit view (turn 2)
**Purpose:** the truck is the page; the decision is the first thing you can touch.
**Layout:** 1240×1080 on Smoke. App bar with breadcrumb; navy identity band (24px/28px, three
groups + right-aligned actions); then `1fr / 372px` body grid, 22px gap, 28px padding.
**Components:**
- Identity band: severity **Badge** (`critical`, "Can't move a load") + 11.5px Mercury location
  line; unit number Montserrat 700 44px white; 13px Moon spec line. Second group, behind a
  `rgba(255,255,255,.18)` vertical rule: `IDLE` eyebrow + 44px Scarlet duration + revenue-not-moved
  line. Actions: `Call driver` (**inverse** — it sits on navy) + `Authorize $1,240` (primary).
- "The one thing blocking this truck" card: 4px Scarlet top rule; Ruby tracked-caps eyebrow;
  21px Montserrat blocker sentence; provenance line; line-item grid `1fr 78px 104px`; total row
  including the promise time; then a Smoke footer strip weighing warranty recovery ($742) against
  the cost of the delay it causes ($2,808) with a `Claim it anyway` outline button.
- "Where the 28 hours went" card (min-height 360px): rows of grid `78px 1fr 90px` — duration,
  label + detail, dollars. Each row has a 2px left border: **Scarlet for the internal-delay row,
  Mercury for the rest**, 18px left padding, 5px left margin. Footer strip on Smoke delivers the
  thesis: two thirds of the downtime was internal.
- Right rail: Alvys read-only grid (with a `READ-ONLY` marker and a closing note that Alvys
  reassigned the load); "This truck is getting expensive" card with cost-per-mile vs. fleet median
  and an 8-bar 56px monthly sparkline (Mercury → Royal → Scarlet for the current month); vendor
  performance card with `Call` (outline) + `Change vendor` (quiet).

### `#2c` — Intake (turn 2)
**Purpose:** dispatch has a driver on the phone. Four fields, one screen, no wizard.
**Layout:** 740×1000, white. Narrow single column, 26px side padding — deliberately not full
width, because it is a phone-call form.
**Components:**
- Unit lookup: 2px Royal border input, Montserrat 700 21px value, with `Look it up` (secondary,
  lg) beside it. Result echoes back as a Smoke panel with a 4px Royal left border: one 12.5px Navy
  600 identity line + one 12px Pewter metadata line. Manual-entry escape link below.
- The single urgency question — "Can it move a load right now?" — as two large cards: NO = 2px
  Scarlet border, `rgba(235,33,39,.05)` fill, Ruby Montserrat 700 14px title; YES = 1px Mercury.
  Each has a 12px consequence line ("clock starts now, load gets flagged" / "goes on the schedule
  instead of the board"). Below: a 12px Pewter rationale sentence.
- Complaint textarea: 1px Mercury, min-height 88px, 1.65 line-height. Photo slots 70×54 as in
  `#1a`, with an inline note that system/component tagging is the shop's job, not dispatch's.
- Pre-submit warning: 4px Scarlet top rule — flags a likely comeback, links the prior WO, and
  notes the vendor's own repair warranty still has 21 days.
- Footer: 12px Pewter note that routing/vendor/estimate happen later; `Cancel` (quiet) +
  `Stop the clock later` (primary).

---

## Interactions & Behavior
Nothing is wired in the mockups. Intended behavior:

**Alvys integration (both directions).**
- On unit-number entry, fetch the unit from the Alvys API and render tractor number, trailer
  number, VIN, driver, current location, odometer, load/trip id, domicile, last PM date, and
  warranty status as **read-only** fields with a visible sync timestamp.
- Alvys is the system of record for the asset; this platform is the system of record for the
  repair. Never let a user edit an Alvys-owned field — offer a manual-entry path instead
  (rentals, owner-operators, units not yet in the TMS).
- Work orders can also arrive *from* Alvys (DVIR defects, PM-due triggers). The dashboard states
  ~61% of work originates that way; manual intake is the minority path.
- On creating a "unit down" work order, push an out-of-service flag back to Alvys so the load can
  be reassigned.

**Duplicate / comeback detection.** On unit + system match against a WO opened or closed in the
last ~30 days, warn before submit, link the prior WO, and surface any remaining vendor repair
warranty. Do not block submission.

**Approval gate.** Assumed threshold: estimates **≤ $500 auto-approve; above that a manager
authorizes**. A revised estimate that exceeds the approved amount re-enters the approval state
(see `#2a`, unit 3187). Threshold should be **configurable, probably per terminal** — treat it as
a setting, not a constant.

**PO issuance.** Approving a vendor estimate is what mints the PO / authorization number. Until
then the field reads "Assigned on approval". The primary button states the amount it is
authorizing.

**The downtime clock (turn 2 only).** Idle time starts when a unit is marked unable to move a
load and stops when it returns to service. Cost of waiting = idle hours × the unit's hourly
revenue rate. The unit page attributes idle time to **phases** — waiting on you, vendor
diagnosing, waiting on a tow, driver reported — so internal delay is measurable. This attribution
is the product's core argument; if you cut it, build turn 1 instead.

**Transitions.** 120/180/280ms, `cubic-bezier(.2,.7,.3,1)`. Fades and short translations only —
no bounce, no spring, no scale-down on press. Hover shifts to the adjacent brand color
(Scarlet→Ruby on primary, Royal→Navy on secondary, Ruby→Scarlet on links); quiet controls take a
Smoke wash. Focus = 3px Royal ring at 35%. Disabled = Moon background + Cool text, never opacity.

**Live values.** Idle timers, accrued cost, and the "$X/hr" burn rate tick in real time — poll or
compute client-side from a start timestamp rather than storing an elapsed number.

**Responsive.** Desktop only, as specified. `#2a`'s four columns are the breakpoint risk; below
~1100px collapse to a single scrolling column with the lane name as a sticky section header.

## State Management
- `units[]` — Alvys-sourced, read-only, cached with a sync timestamp per unit.
- `workOrders[]` — locally owned. Fields: unit ref, source (breakdown call / DVIR / PM due /
  roadside / inspection / walk-around), can-move-load boolean (or severity enum in turn 1),
  system, component, complaint text, attachments, assignee (bay + tech, or vendor), estimate
  line items, approval state, PO number, promised-back timestamp, invoice, activity log.
- `vendors[]` — approved list with distance, terms, avg turn time, promise-hit rate.
- Derived, not stored: idle duration, accrued cost of waiting, lane assignment (computed from the
  blocker), cost per mile, PM compliance, board sort order.
- `approvalThreshold` — a setting, per terminal.
- Board sort is **derived from cost of waiting**, never a user-assigned rank. Do not add
  drag-to-prioritize; it reintroduces the gaming problem the design exists to avoid.

## Design Tokens
All values come from the bound Capital Logistics Group design system. Use its CSS custom
properties rather than these literals — the hexes are listed only so the mockups can be read.

**Primary:** Royal `#1155A1` (`--clg-royal`) · Navy `#223B62` (`--clg-navy`) ·
Scarlet `#EB2127` (`--clg-scarlet`) · Ruby `#BE202E` (`--clg-ruby`)

**Neutrals** (all blue-greys — never introduce a warm or pure grey):
Granite `#485767` · Pewter `#5A6D80` · Cool `#7A8B99` · Mercury `#A3BACB` ·
Moon `#BFD3E1` · Reflection `#DAE7F1` · Smoke `#E7EDF1` · White `#FFFFFF`

**Color roles as used here:** blue carries structure (app bars, hero bands, unit identity);
red carries attention (the one primary CTA, the accent top rule, over-threshold and
over-24h values). Body copy is Granite on white — **not black**; pure black is not a brand color.
Headings Navy. Links Ruby at rest → Scarlet on hover. **One accent color per surface** — a screen
with a Scarlet CTA does not also get Ruby rules.

**Type:** Montserrat (`--clg-font-heading`) for headings, numbers, and tracked caps labels;
Poppins (`--clg-font-body`) for body. Ladder: H1 40 / H2 36 / H3 30 / H4 24 / H5 18 /
tracked caps 14 / body 15. In these dense screens body runs 12–13.5px and tracked caps labels
10.5–12px with letter-spacing .12–.14em — that compression is intentional for an ops tool and is
below the brand guide's print ladder.

**Radii:** 0 everywhere. The brand reads angular; radii stay 0–4px and pills are reserved for
small status chips. Nothing in these screens is rounded.

**Borders:** 1px Reflection or Moon hairlines separate cards — not shadows. Emphasis is a **4px
Scarlet top rule** on the card, never a colored left border on a rounded box.

**Shadows:** navy-tinted and shallow (`--clg-shadow-sm/md`). The mockup board's card shadows are
canvas presentation chrome, not part of the UI.

**Spacing:** 4px base. Common: 12/14/16/18px inside cards, 22/26/28px page padding, 1px grid gaps
on the board.

## Components used from the design system
Mount these rather than restyling raw HTML:
- **Button** — variants `primary` (Scarlet, one per surface), `secondary` (Royal), `outline`,
  `quiet`, `inverse` (for use on navy); sizes `sm`/`md`/`lg`. `ghost` is **not** a variant.
- **Badge** — tones `critical` (unit down), `brand` (urgent), `neutral` (routine).
- Also available and appropriate as you build out: **Card**, **Table**, **StatBlock**, **Alert**,
  **Divider**, **Field / Input / Select / Checkbox / Radio / Switch**, **Link**, **Icon**,
  **Logo**, **StarMark**, **Eyebrow**.

The severity chips and all buttons in the mockups already route through Button/Badge. Everything
else is hand-composed inline markup and should be replaced with the design system's primitives
(and your codebase's) where they exist.

## Assets
- `assets/mark-star-white.svg` — the CLG five-point star, white contrast points with the
  scarlet/ruby leading arm. Used at 22–26px in app bars and at 260–280px, `opacity:.06–.07`,
  bleeding off the bottom-right corner of navy hero bands. That oversized cropped star is the
  brand's signature empty-space device — keep it.
- `assets/mark-star.svg` — royal-contrast variant, for light fields.
- `assets/logo-white.svg` — full reverse lockup, for surfaces that need the wordmark rather than
  the compact mark.
- Fonts: Montserrat + Poppins. `tokens/fonts.css` ships `Montserrat-Regular` and
  `Poppins-Regular` locally; **Montserrat Bold and the Poppins italic/bold faces currently load
  from Google Fonts.** Self-host them in production.
- No UI icon set exists in the brand. The design system wraps **Lucide** as a documented
  substitution — use its `Icon` component so a real CLG set can be swapped in one place. No emoji,
  ever; none appear in the brand guide and they undercut the register.
- No photography is used in these screens. If you add fleet imagery, it is full-bleed or
  edge-anchored — never a floating rounded thumbnail — and copy over it needs a **navy** scrim,
  not black.

## Copy guidance
Voice is plain, declarative, operational — short sentences, no hedging, no superlatives, no
startup register. Casing is the loudest cue: **tracked uppercase for labels**
(`WAITING ON YOU`, `FROM ALVYS`, `IDLE`), sentence case for everything else.

Two habits specific to this product, both worth preserving:
1. **Statuses name the blocker and its owner**, not an abstract stage. "Waiting on you" beats
   "Pending approval"; "Rush Truck Center needs authorization to start" beats "Awaiting vendor".
2. **Empty states tell the truth** rather than apologizing — "A lane can be empty and that is good
   news. Nothing is invented to fill it."

Operational identifiers are shown, not hidden — real-looking unit numbers (3303), trailer numbers
(100096), trip ids (ALV-884213), PO numbers (88412), VINs. Use plausible identifiers in any new
screens rather than lorem placeholders.

## Open questions for the product owner
1. **Which direction** — turn 1, turn 2, or the hybrid recommended above.
2. **The $500 approval threshold** is my assumption, as is auto-approval below it. Confirm the
   number and whether it varies by terminal or by vendor.
3. **Cost of waiting** needs an hourly revenue rate per unit. Does Alvys expose one, or is it a
   fleet-wide constant?
4. **Warranty recovery** is given a lot of visual weight. Confirm it is worth chasing often
   enough to earn that prominence.
5. **Not yet designed:** the technician's view (mobile, log labor and parts against a WO), PM
   scheduling, parts inventory, invoice reconciliation, and any multi-tenant SaaS surface
   (org switcher, roles, white-label theming). The design only "hints at" SaaS today.

## Screenshots
`screenshots/` holds a 1x PNG of every screen, named by its id:

| File | Screen |
| --- | --- |
| `2a-board.png` | `#2a` The board (turn 2) |
| `2b-unit-view.png` | `#2b` Unit view (turn 2) |
| `2c-intake.png` | `#2c` Intake, one screen (turn 2) |
| `1a-intake-guided.png` | `#1a` Intake, guided 3 steps |
| `1b-intake-single.png` | `#1b` Intake, single screen |
| `1c-queue.png` | `#1c` Queue, approval-first |
| `1d-work-order-detail.png` | `#1d` Work order detail |
| `1e-dashboard.png` | `#1e` Dashboard |

The PNGs are for orientation. **The HTML is authoritative** for exact values — read the markup
when a measurement or hex matters, since the captures are re-rendered rather than pixel copies.

## Files
- `Work Order Platform.dc.html` — the design board; all eight screens.
- `support.js` — runtime for the streaming template format. **Reference only; do not port.**
- `_ds/capital-logistics-group-design-system-.../` — the bound design system: `tokens/*.css`
  (the authoritative token values), `styles.css`, `_ds_bundle.js` (Button, Badge, and the other
  17 components), and `assets/`.

Open the board in a browser to read it. It is a pan/zoom canvas: turn 2 sits at the top, turn 1
below it, each screen labelled with the id used in this document.
