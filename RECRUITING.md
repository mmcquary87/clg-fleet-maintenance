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
| Tenstreet | System of record for applications, driver qualification files, MVR/PSP consents | API access requested; until confirmed, use CSV export/import. Do not duplicate DQ data in our DB |
| FMCSA QCMobile | Carrier authority, power units, safety and inspection data | Free web key, stored as an Edge Function secret |
| Aljex (Descartes) | Brokerage carriers and load history — the warmest leads | API or scheduled export (TBD) |
| Alvys | Asset-side TMS / dispatch | Existing API connection (already integrated elsewhere in this app) |
| Samsara | ELD, HOS, miles | Existing API connection (already integrated elsewhere in this app; retention phase) |
| Twilio | SMS | A2P 10DLC registration required before any live texting |
| Microsoft 365 (Outlook) | Email outreach and recruiter notifications | Microsoft Graph API |
| Claude API | Screener conversations and structured extraction | Edge Function secret |

## 5. Stack (as actually built — see note at top of this file)

Supabase Postgres (migrations via SQL Editor), Deno Edge Functions (deployed via dashboard), React frontend (this same CLG OS app, a new nav section once there's UI to show), `pg_cron` for anything the original design wanted APScheduler/cron for. No FastAPI, no Alembic, no separately-hosted process.

## 6. Data model (starting point)

- `leads` — id, source (aljex | fmcsa | job_post | referral), segment, status, mc_number, dot_number, name, company, phone, email, home_base, power_units, authority_date, fit_score, opt_in_sms (bool + timestamp + method), created_at
- `vetting_flags` — lead_id, flag_type, detail, severity, cleared_by, cleared_at
- `conversations` — lead_id, channel, direction, body, model_extraction (JSON), sent_at
- `screening_answers` — lead_id, cdl_class, years_experience, equipment, truck_year, truck_make, lanes_wanted, home_time, trade_in_interest
- `onboarding_steps` — lead_id, step (tenstreet_app | drug_test | lease_esign | fuel_card | samsara_eld), status, updated_at
- `events` — audit log of every automated action and every human approval

Status flow: `new → vetted → contacted → screening → qualified → recruiter_review → onboarding → leased_on`, with exits `disqualified`, `not_interested`, `opted_out`.

## 7. Build order and done criteria

Build one module per session. Each must pass its tests before the next starts.

1. **Lead database** — schema, migrations, seed data. Done when migrations run clean and tests cover the status flow.
2. **Lead sourcing** — Aljex importer (rank small carriers by CLG loads hauled and lane fit), FMCSA client (filter by authority age, power units, safety, home base), inbound form endpoint. Done when a run produces a deduplicated, scored lead list.
3. **Vetting** — flags for authority age, inspection and out-of-service history, identity mismatches (name/phone/email vs. FMCSA record). High-severity flags block outreach until a person clears them. Done when flagged leads cannot reach `contacted`.
4. **AI screener** — Claude-run conversation by email, or SMS only with opt-in. Collects the fields in `screening_answers`. Sends a net-pay estimate: guaranteed floor = $0.75 × expected weekly miles, with assumptions shown. Done when a test conversation extracts every field correctly and stays within the rate sheet.
5. **Handoff** — qualified leads go to the recruiter by email with a one-paragraph summary. Target recruiter call within 1 business day. Every lease offer requires a logged human approval.
6. **Onboarding tracker** — tracks the five steps; nudges the candidate and alerts the recruiter after a 48-hour stall. Target lease-on in under 7 days.
7. **Recruiter dashboard** — pipeline by stage, days to lease-on, cost per lease-on, source performance.
8. **Retention signals (later)** — falling weekly miles, rejected loads, missed home time from Samsara/Alvys trigger a human call.

## 8. Guardrails (non-negotiable)

- **Dry-run by default.** No real email or SMS leaves the system unless explicitly enabled. Dev and tests always dry-run.
- **TCPA.** No automated texts without recorded prior consent. Cold FMCSA leads are contacted by email or phone first. Honor STOP/opt-out instantly and permanently. Respect quiet hours in the recipient's time zone.
- **CAN-SPAM.** Every email includes CLG's physical address and a working unsubscribe.
- **Background checks** (MVR, PSP) run through Tenstreet with the candidate's consent. Never pull them from this system.
- **Fair screening.** Scoring uses only business factors (authority, safety, equipment, lanes, experience). Never collect or use age, race, religion, national origin, sex, disability, or similar attributes.
- **Human in the loop.** The AI never makes a lease offer, promises a start date, or states terms outside the rate sheet config.
- **PII.** Secrets in Edge Function secrets only, never committed. Encrypt phone and email at rest where the platform supports it. Log actions, not full message bodies, in application logs.
- **Audit trail.** Every automated action and human approval is written to `events`.

## 9. Open questions (ask before assuming)

- Tenstreet API access: yes or no?
- Aljex access method: API or export?
- Maintenance escrow contribution per settlement
- Minimum available days to earn the guarantee
- Expected weekly miles to use in the net-pay estimate
- Who the recruiter is and how they want alerts
- River City contact and handoff method for trade-in leads
