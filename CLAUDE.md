# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fleet & operations platform for CLG Transportation (a trucking company). Started
as a maintenance-spend tracker (see `SPEC.md` for the original goal, data model,
and phasing rationale) and has grown into a broader ops tool: work order /
downtime board, driver roster & home-time tracking, chargebacks, and dashboards
pulling from the company's TMS (Alvys) and telematics (Samsara) providers.
`SPEC.md` is the original design doc — useful for *why* decisions were made
(e.g. no self-hosted server), but treat it as historical; the app now covers
more than what it describes. `DESIGN_QUEUE.md` is the running log of what's
actually been built and shipped, phase by phase — check it before `SPEC.md`
for current state.

Architecture is deliberately "no server to babysit": a static React frontend
talking directly to managed Supabase (Postgres + Auth + Storage + Edge
Functions), no self-hosted backend. This is a hard constraint from the client
(no in-house IT), not just a starting choice — don't introduce a
traditionally-hosted server/API layer.

## Repo layout

- `web/` — the React + Vite frontend. This is the only directory with a
  package.json / build step; everything else is SQL, Deno edge functions, or
  docs.
- `supabase/migrations/` — hand-run SQL migrations, applied manually via the
  Supabase SQL Editor (see Backend section below — there's no local Supabase
  CLI project, no `config.toml`).
- `supabase/functions/*/index.ts` — Deno Edge Functions, deployed manually via
  the Supabase dashboard's "Via Editor" flow (not `supabase functions deploy`).
- `supabase/example_data.sql` — reference dataset only (the 6 real invoices
  from `SPEC.md`'s proof of concept). Not for the real project.
- `extracted/*.jsx` — pre-Supabase single-file prototypes used as UX/data-model
  reference during the initial build (see `SPEC.md`). Not live code, not
  imported by anything in `web/`.
- `design_handoff/` — source of truth for the design system (colors, type,
  spacing tokens) that `web/src/ds/tokens.css` was ported from.
- `SPEC.md`, `SETUP.md`, `DESIGN_QUEUE.md` — build history / setup notes /
  UI polish backlog, in that order of "how much has changed since this was
  written."

## Commands

All commands run from `web/`:

```
npm install
npm run dev       # Vite dev server
npm run build     # production build
npm run preview   # preview a production build
npm run lint      # oxlint
```

There is no test suite in this repo. There's also no CI config — validate
changes locally with `npm run lint` and `npm run build`, and by running the
dev server against real Supabase data (see env setup below).

Frontend env: copy `web/.env.example` to `web/.env.local` and fill in
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (the anon key is safe to expose;
access is governed by RLS, not key secrecy — see `SETUP.md`/`DESIGN_QUEUE.md`
for the real project's values). `web/src/lib/supabaseClient.js` throws at
import time if these are missing.

## Frontend architecture (`web/src`)

- `App.jsx` is the auth gate: shows a loading state, then `LoginForm` /
  `SetPasswordForm` (invite/recovery flow) / `Dashboard` depending on
  `useAuth()`'s session state.
- `Dashboard.jsx` owns the top nav and tab switching (plain `useState`, no
  router) and renders one top-level view component per tab
  (`components/board`, `components/workorders`, `components/roster`, etc.).
  Adding a page means: add a view component, add it to `NAV_GROUPS`, add the
  `tab === "..."` render line.
- `hooks/` — one hook per data concern (`useUnits`, `useWorkOrders`,
  `useRoster`, `useBoard`, ...), each calling `supabase-js` directly. There is
  no separate API/service layer — components read Postgres through
  hooks-wrapping-supabase-js, and RLS policies are the only access control.
- `lib/` — pure helper functions (date range presets, CSV export, category
  color/label maps, KPI math). No side effects, no Supabase calls.
- `ds/` — the internal design system (`Button`, `Card`, `Table`, etc., barrel
  exported from `ds/index.js`) plus `ds/tokens.css`, which defines all
  `--clg-*` CSS custom properties (brand colors, type scale, spacing,
  shadows). Most components still use inline `style={{ ... }}` objects
  referencing these tokens rather than a CSS framework — match that pattern
  rather than introducing Tailwind/CSS modules/etc.
- Fonts/brand: Montserrat (headings) + Poppins (body), navy/royal/scarlet
  palette — defined once in `tokens.css`, don't hardcode hex colors in
  components.

## Backend (Supabase)

No local Supabase CLI project exists (no `supabase/config.toml`) — migrations
and edge functions are developed as files in this repo but applied/deployed
**by hand** through the Supabase dashboard:

- Migrations: SQL Editor → paste the new file's contents → Run. Filenames are
  timestamp-prefixed (`YYYYMMDDHHMMSS_description.sql`) and applied in order;
  follow that naming convention for new migrations and never edit an already-
  applied migration file — add a new one.
- Edge functions: dashboard's "Via Editor" flow, not `supabase functions
  deploy`. Secrets (`ANTHROPIC_API_KEY`, `ALVYS_CLIENT_ID`/`ALVYS_CLIENT_SECRET`,
  `SAMSARA_API`, service role key where needed) are set in Edge Functions →
  Secrets, never in code or committed anywhere.

Core tables (from `supabase/migrations/20260826120000_init_schema.sql`):
`units`, `vendors`, `work_orders`, `fault_events`, `dvir_defects`, plus
`profiles` (role: dispatcher/mechanic/admin, added in
`20260826130000_auth_profiles.sql`) and a growing set of driver/roster/
chargeback tables added in the `2026082[7-8]*` migrations. `work_orders`
status flows `Open-Proposed → Open → In Progress → Closed`; `source` tracks
whether a work order came from `manual` entry, `samsara_fault`, or
`samsara_dvir`.

**Categories must stay in sync across three places** whenever they change:
the Postgres `wo_category` enum (`init_schema.sql`), the `CATEGORIES` array in
`web/src/lib/categories.js`, and the `CATEGORIES` array in
`supabase/functions/scan-invoice/index.ts`. These have drifted before (a
`Tow` category was added to the frontend list without a matching enum
migration) — check all three before assuming a category value will round-trip
through the database.

Auth is invite-only (public signup is disabled). New users are invited from
the Supabase dashboard or the in-app admin Settings page
(`invite-user`/`list-users`/`update-user-permissions` edge functions); a
trigger auto-creates a `profiles` row per new `auth.users` row. RLS policies
generally gate on `auth.role() = 'authenticated'` (any logged-in user, not
yet split by dispatcher/mechanic/admin for most tables); the one exception is
the driver roster, which has a dedicated per-user `profiles.can_edit_roster`
flag checked by its own RLS policies (independent of `role`).

## External integrations (Edge Functions)

- **Alvys** (TMS) — OAuth2 client-credentials against `auth.alvys.com`,
  read-only (Alvys exposes no way to write maintenance data back).
  `alvys-sync-equipment`/`alvys-import-maintenance` were one-time historical
  backfills (idempotent, safe to re-run by hand); `alvys-sync-drivers`,
  `alvys-sync-loads`, and related functions feed the roster/ops views. Watch
  for Alvys's `Page` search parameter being **0-indexed**, unlike its own docs.
- **Samsara** (telematics) — plain bearer token (`SAMSARA_API` secret, not
  OAuth), read-only. `samsara-sync` pulls vehicle roster/fault
  codes/fuel-odometer-location/DVIR defects in one run and is scheduled via
  `pg_cron` every 15 minutes (`20260828150000_samsara_sync_schedule.sql`) —
  it's the one integration with an actual recurring schedule; the Alvys
  functions are still manual/on-demand. When writing Supabase `.upsert()`
  calls against partial column sets, know that Postgres still validates
  NOT NULL constraints on the whole row before checking for a conflict — use
  per-row `.update()` (fired concurrently, not sequentially) instead of a
  bulk upsert when a sync only has 1-2 columns of new data for existing rows.
- **Claude API** (`scan-invoice` function) — extracts vendor/category/cost/
  date/invoice ref from an uploaded receipt image or PDF using strict tool
  use, not the SDK's `zodOutputFormat` helper (that helper's subpath import
  fails to resolve in Supabase's Deno edge runtime). Only ever returns
  extracted fields for the frontend to prefill a form for human review — it
  never writes to the database itself. Requires a valid Supabase auth JWT
  (default `verify_jwt` behavior).

## Deployment

Frontend: Vercel, project root set to `web`, auto-deploys on every push to
`master`. There is no staging environment or preview-gating step beyond
Vercel's own PR previews — pushing to `master` is a production deploy.
