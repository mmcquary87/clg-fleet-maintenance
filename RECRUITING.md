# CLG Owner-Operator Recruiting System — handover doc

This is the original handover doc for the Owner-Operator Recruiting System,
kept verbatim as the source of truth for its scope, program terms, data
model, and guardrails. It was originally written assuming a standalone
Python/FastAPI/Postgres/Alembic service — **that stack was not used.**
CLG OS is deliberately "no server to babysit" (a hard client constraint,
see root `CLAUDE.md`), so this system was rebuilt onto CLG OS's own stack
instead: Supabase Postgres + Deno Edge Functions, migrations via the SQL
Editor, functions deployed via the dashboard's "Via Editor" flow — same as
every other integration in this repo (Alvys, Samsara, scan-invoice).

Read this doc for *what* the system needs to do (program terms, lead
segments, data model, guardrails, build order). Read root `CLAUDE.md` for
*how* it's actually implemented in this repo (migrations convention, edge
function deploy process, frontend patterns).

**2026-09-27 update:** a much larger CRM/onboarding spec
(`Recruiting_CRM_Onboarding_Spec.md`, not checked into this repo — ask for
it if you need the full doc) was handed over on top of this original
handover doc, along with an already-built (but never live-tested) Python
reference implementation. Direction given: treat that CRM spec as the
system's *end-state target*, but keep building at **this file's** pace —
one module per session — rather than the spec's own faster phasing. Where
the two disagree on scope, this file wins until told otherwise. Section 6
and 7 below now reflect the CRM spec's governed data model (adopted and
adapted in one pass, since it was cheap to do before real data existed),
not the original doc's simpler starting-point schema.

---

## 1. What we're building

An AI recruiting system for CLG Transportation LLC (Jacksonville, FL). It finds, vets, screens, and onboards owner-operators, then hands qualified candidates to a human recruiter.

The system is part of the CLG Owner-Operator Program, which adds capacity for freight CLG currently turns down (CJ Logistics, Mizkan, and the upcoming Niagara Bottling account). The full business plan lives in the Claude Doc "CLG Owner-Operator Program Plan".

**In scope:** lead sourcing, vetting, AI screening conversations, recruiter handoff, onboarding tracking, recruiter dashboard. Retention signals come later.

**Out of scope:** the driver-facing load board and load approval (handled inside Alvys by Foundry, Alvys' AI layer), settlements and escrow accounting, truck sales transactions.

## 2. Program terms the AI may present

These are the ONLY terms the screener may state. Keep them in one config file (`config/rate_sheet.yaml` in the original design — TBD where this lives in the Supabase build) so they can be changed without code edits. The AI never negotiates, never invents terms, and never makes a lease offer.

- **Net Mileage Guarantee:** at least $0.75 per mile net for leased owner-ops. Non-recoverable: shortfalls are never owed back. Earned only in weeks the owner-op meets availability conditions (load acceptance, minimum available days, ELD connected).
- **Net** = (gross settlement − listed operating costs) ÷ dispatched miles. Listed costs: program fuel, truck payment, insurance through CLG, maintenance escrow, plates/permits/ELD fees.
- **Maintenance escrow:** a set amount per settlement goes into a maintenance account; repairs are charged against it. Above $2,500, withholding stops and the owner-op gets the full settlement.
- **Fuel program:** CLG's Love's and TA/Petro discount pricing.
- **Fast pay:** QuickPay through Triumph (terms pending — do not quote rates).
- **River City trade-in:** any truck qualifies for trade-in toward a newer, more reliable truck. River City handles appraisal and financing; the AI only collects truck details and routes interest.

Never use the words "wage", "wage deficit", "employee", or "hire" in candidate-facing text. Owner-ops are independent contractors.

## 3. Lead segments

Every lead gets exactly one segment. The segment decides the pitch.

| Segment | Who | Offer |
| --- | --- | --- |
| `new_mc` | Authority under ~2 years, 1–3 power units | Lease onto CLG's authority and insurance with the $0.75 guarantee |
| `small_fleet` | Established authority, 2–10 power units | Brokerage carrier program: consistent lanes, fuel program, QuickPay. Not lease-on by default |
| `driver` | CDL driver with no truck | Truck purchase / lease-purchase path, then lease onto CLG |

## 4. Systems and integrations

| System | Role | Access |
| --- | --- | --- |
| Tenstreet | Applications, driver qualification files, MVR/PSP consents | API access requested; until confirmed, use CSV export/import. **2026-09-27 decision:** candidate identity + application/pipeline stage syncs into CLG OS (same `leads`/`onboarding_case_steps` tables recruiters already work in — see below). Sensitive DQF content (SSN, medical cert, drug test result, license image) stays in Tenstreet only; CLG OS links out to the Tenstreet record rather than storing it. Tenstreet remains the compliance system of record for DQF itself |
| FMCSA QCMobile | Carrier authority, power units, safety and inspection data | Free web key, stored as an Edge Function secret |
| Aljex (Descartes) | Brokerage carriers and load history — the warmest leads | API or scheduled export (TBD) |
| Alvys | Asset-side TMS / dispatch | Existing API connection (already integrated elsewhere in this app) |
| Samsara | ELD, HOS, miles | Existing API connection (already integrated elsewhere in this app; retention phase) |
| Twilio | SMS | A2P 10DLC registration required before any live texting |
| Microsoft 365 (Outlook) | Email outreach and recruiter notifications | Microsoft Graph API |
| Claude API | Screener conversations and structured extraction | Edge Function secret |

## 5. Stack (as actually built — see note at top of this file)

Supabase Postgres (migrations via SQL Editor), Deno Edge Functions (deployed via dashboard), React frontend (this same CLG OS app, a new nav section once there's UI to show), `pg_cron` for anything the original design wanted APScheduler/cron for. No FastAPI, no Alembic, no separately-hosted process.

## 6. Data model (as actually built — CRM spec's governed schema, adapted)

Adopted from the Python reference implementation's `db/001_init.sql` +
`db/002_crm_onboarding.sql`, in the `public` schema (not a separate
`recruiting` schema), reusing this app's existing `profiles`/`user_role`
instead of new CRM-specific user tables. Live via three migrations
(`20260927030000`–`20260927040200`):

- `leads` — segment (`new_mc`/`small_fleet`/`driver`), status, `source_code`
  (FK to `lead_sources`), dot/mc number, name fields, `latest_snapshot_id`,
  `fit_score`/`score_status`/`score_coverage`/`score_version`/
  `score_breakdown`/`scored_at`, `disqualified_reason`, `owner_id` (→
  `profiles`), `rating`/`tier`, conversion tracking to `accounts`/`contacts`
- `carrier_snapshots` — append-only raw FMCSA pulls (one row per pull, full
  field set + `raw jsonb`)
- `lead_vetting_flags` — flag_code (FK to `vetting_flag_types`), severity
  (disqualifying/review/info), state (open/cleared/confirmed)
- `lead_conversations` (append-only), `lead_status_history` (trigger-written)
- `accounts`, `contacts` — the CRM layer once a lead converts
- `campaigns`, `campaign_members`
- `onboarding_templates` (DRAFT/approved/retired, one approved template per
  pathway max) + `onboarding_template_steps`; `onboarding_cases` +
  `onboarding_case_steps`, gated by a **clear-to-dispatch trigger** that
  refuses to move a case to `cleared` unless its template is approved and
  every required step is complete/waived
- `roster_candidates` — a cleared lease-on/company-driver case lands here,
  never writes the driver roster directly; Operations reconciles
- `documents`, `tasks`, `field_history` (attribution via `auth.email()`)
- `excluded_entities` + an enforcement trigger — CLG Transportation (MC
  873396) and Capital Logistics Group (MC 881808) itself, plus Silver Moon
  Transportation, can never become recruiting targets
- Broad `authenticated`-role RLS on every table above (fine-grained
  per-CRM-role RLS is the CRM spec's own Phase 2, not solved yet)

Lead status vocabulary (per the adopted schema, replacing this doc's
original status flow): `new → enriched → qualified → contacted →
in_conversation → onboarding → signed`, with exits `disqualified`, `lost`,
`do_not_contact`.

**All recruiting leads already live in CLG OS** — `leads` is the system of
record regardless of source (FMCSA, Aljex, referral, Tenstreet, or manual
entry). A Tenstreet-sourced applicant becomes a `leads` row
(`source_code = 'tenstreet'`) that progresses through the same
`onboarding_cases`/`onboarding_case_steps` every other pathway uses — no
separate Tenstreet-shaped tables. Only the DQF documents themselves stay
external, linked out to Tenstreet by reference.

**2026-09-28: manual entry + Tenstreet CSV import built** (no API access
confirmed yet, so no live integration — see the open question below).
`components/recruiting/NewLeadForm.jsx` adds one lead by hand;
`TenstreetImportForm.jsx` uploads a CSV export from Tenstreet, maps its
columns to lead fields (auto-guessed from the header row, always
overridable), previews, then bulk-inserts, de-duping against existing
leads' phone/email. Both live behind buttons on the Leads view.

## 7. Build order and done criteria

Build one module per session. Each must pass its tests before the next starts.

1. **Lead database** — ✅ done. Schema now the full governed CRM/onboarding
   model above, not just the original placeholder shape.
2. **Lead sourcing** — FMCSA part ✅ done: `fmcsa-import` Edge Function pulls
   by DOT number, checks `excluded_entities`, snapshots, derives vetting
   flags and scores every lead (logic ported from the Python reference's
   `vetting.py`/`scoring.py`, config-driven, stamped `score_status =
   'provisional'` until CLG approves a scoring config). Aljex importer and
   the inbound web form endpoint are **not built** — see the open scope
   decision below.
3. **Vetting** — flags are mechanically derived and stored (module 2). A
   recruiter can see them and act on them: each open flag gets an optional
   note plus Clear (false positive) / Confirm (accurate, doesn't block)
   actions, stamping `resolved_at`/`resolved_by` on `lead_vetting_flags`.
4. **AI screener** — not started as a live conversation. A smaller,
   deliberately scoped piece is done: `lib/outreachTemplates.js` +
   `OutreachDraftPanel.jsx` (new section on `LeadDetailModal`) generate a
   draft email or SMS from *only* the pre-approved program terms in
   section 2 above -- no LLM call, nothing that could vary a number a
   human hasn't approved. A human reviews, edits, copies, and sends it
   themselves through their own email/SMS; "Mark as sent" only logs a
   `lead_conversations` row after the fact. No provider (Twilio,
   Microsoft Graph) is wired in, and nothing is ever sent automatically
   -- matches the dry-run-by-default guardrail in section 8 exactly.
5. **Handoff** — not started.
6. **Onboarding tracker** — UI built: `components/onboarding/OnboardingView.jsx`
   (filterable case list off the `onboarding_board` view + a "New case"
   form -- picks an existing account/contact and a template; the DB's own
   `seed_case_steps` trigger populates the case's steps) and
   `OnboardingCaseModal.jsx` (step checklist grouped by stage with
   Start/Complete/Waive actions -- a `requires_document` step prompts for
   a document link before it can complete, matching the DB's own
   constraint -- and case-level Hold/Resume/Withdraw/Reject/Clear
   actions). Deliberately does not replicate the clear-to-dispatch gate's
   logic in the frontend -- a blocked Clear just surfaces the DB
   trigger's own raised exception. All seeded templates are still DRAFT,
   so no case can clear yet until one is approved.
7. **Recruiter dashboard** — Leads pipeline view done (see below);
   onboarding board/case UI (above) added to the same Recruiting nav
   group. **2026-09-28: a Claude Design handoff arrived** (a design
   package covering Home, Campaigns, Accounts/Contacts, and enhancements
   to the existing Leads/Onboarding views -- reference only, rebuilt with
   this app's own `web/src/ds` primitives, not ported from its
   HTML/runtime). Home is built first (`RecruitingHomeView.jsx`,
   `useRecruitingHome.js`): derived heading/lede, segment tiles, a
   6-bucket "by status" stacked bar, three attention cards (leads to
   review, overdue onboarding steps, starting soon), and a merged
   activity feed -- now the default landing tab for a pure recruiter
   account. Campaigns built next (`components/recruiting/campaigns/`):
   a rich empty state, a filterable list with a mini funnel per row, a
   campaign record with the funnel as a real trapezoid shape (per-stage
   drop-off in words, a rail with targeting and a derived "steepest
   drop" sentence), Launch/Pause/Resume actions, and a bulk-select
   checkbox column + navy selection bar on Leads feeding an "Add to a
   campaign" modal. Tasks built too (the `tasks` table existed with no
   UI at all): `useTasks`/`TasksPanel` (compact list + quick-add, now on
   both `LeadDetailModal` and `OnboardingCaseModal`) and a new "Tasks"
   nav item (`TasksView.jsx`) listing every open task across leads and
   cases, "Mine only" filter, overdue in Scarlet. Still to build from
   that handoff: Accounts/Contacts, and the documents-rail enhancement
   to the existing Leads/Onboarding record views.
   `components/recruiting/RecruitingView.jsx`/`LeadDetailModal.jsx` --
   filterable leads table (segment, active/all pipeline), fit score shown
   with its provisional/pending status rather than a bare number, per-lead
   detail (FMCSA snapshot, full flag history, activity log), clear/confirm
   on vetting flags inline, plus a manual "New lead" form and a Tenstreet
   CSV import. The `recruiter` role lands on Home instead of a placeholder
   screen, and is the *only* nav group a pure recruiter account sees
   (Sidebar); an admin sees it too.
8. **Retention signals (later)** — not started.

**"Convert lead" action** — done (`components/recruiting/ConvertLeadForm.jsx`,
surfaced in `LeadDetailModal`). Optionally creates an `accounts` row
(checked by default for new_mc/small_fleet, unchecked for driver leads),
always creates a `contacts` row pre-filled from the lead's contact info,
and stamps `leads.converted_at`/`converted_account_id`/
`converted_contact_id`. This is what feeds the New Case form's
account/contact pickers (module 6, above) — convert a lead first, then
start its onboarding case from the now-populated dropdowns. Hidden for
disqualified/lost/do-not-contact leads.

**Open scope decision (flagged, not yet resolved):** the CRM spec's own
Phase 1 also calls for an Aljex tier-import script and 3 more UI pages
(Recruiting Home, Campaigns, plus richer Leads/Onboarding record views
than what's built) — beyond this file's one-module-per-session pace.
Per the note at the top of this file, nothing there is started until scope
and pace are confirmed.

## 8. Guardrails (non-negotiable)

- **Dry-run by default.** No real email or SMS leaves the system unless explicitly enabled. Dev and tests always dry-run.
- **TCPA.** No automated texts without recorded prior consent. Cold FMCSA leads are contacted by email or phone first. Honor STOP/opt-out instantly and permanently. Respect quiet hours in the recipient's time zone.
- **CAN-SPAM.** Every email includes CLG's physical address and a working unsubscribe.
- **Background checks** (MVR, PSP) run through Tenstreet with the candidate's consent. Never pull them from this system.
- **Fair screening.** Scoring uses only business factors (authority, safety, equipment, lanes, experience). Never collect or use age, race, religion, national origin, sex, disability, or similar attributes.
- **Human in the loop.** The AI never makes a lease offer, promises a start date, or states terms outside the rate sheet config.
- **PII.** Secrets in Edge Function secrets only, never committed. Encrypt phone and email at rest where the platform supports it. Log actions, not full message bodies, in application logs.
- **Audit trail.** Every automated action and human approval is written to `events`.

## 9a. Confirmed FMCSA QCMobile API limitations (2026-09-27)

Checked every `_links` sub-resource on a real carrier's base response
(`/carriers/{dot}`, `/authority`, `/docket-numbers`, `/basics`,
`/operation-classification`, `/cargo-carried`) against DOT 2516954. Two
fields section 3/6 assume are simply not exposed by this API:

- **No authority-granted/registration date anywhere.** `new_mc` vs.
  `small_fleet` is assigned on `power_units` alone instead (1-3 vs.
  4-10) until a module 3 vetting flag or a different data source (FMCSA's
  separate public Licensing & Insurance lookup, or Aljex) supplies real
  authority age.
- **No contact phone or email.** An FMCSA-sourced lead is structurally
  incomplete for outreach (`leads.phone`/`email` stay null) until
  enriched from elsewhere -- `fmcsa-import` only sources and scores,
  never attempts contact.

`basics` returns BASIC safety category scores (Unsafe Driving, HOS
Compliance, Driver Fitness, Drugs/Alcohol, Vehicle Maintenance) with a
`basicsRunDate` (when FMCSA last computed the score) -- not a
registration date, easy to mistake for one.

## 9. Open questions (ask before assuming)

- Tenstreet API access: yes or no?
- Aljex access method: API or export?
- Maintenance escrow contribution per settlement
- Minimum available days to earn the guarantee
- Expected weekly miles to use in the net-pay estimate
- Who the recruiter is and how they want alerts
- River City contact and handoff method for trade-in leads

From the CRM spec (2026-09-27 update, still unresolved):
- Who has authority to approve an onboarding template (moves it out of DRAFT)?
- PSP report pull policy — who requests it, and when in the pipeline?
- Insurance requirements to state precisely for owner-operator onboarding
- Does brokerage-carrier onboarding live in CLG OS at all, or stay a
  separate brokerage-side process?
- Where do onboarding documents (licenses, COIs, signed agreements) get
  stored — Supabase Storage, or somewhere else?
- Aljex's driver phone field — availability still pending confirmation
