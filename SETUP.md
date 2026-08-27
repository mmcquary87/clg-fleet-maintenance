# Phase 1, step 1 — stand up Supabase (DONE)

Project: `CLG Transportation` (ref `fxveuksdxjovgsxrevpa`), schema migrated in,
5 empty tables confirmed.

- Project URL: `https://fxveuksdxjovgsxrevpa.supabase.co`
- Publishable (anon) key: `sb_publishable_bXWQvA_5uFdZMDU9DNaHtA_zxaGrAAD`

Both values above are safe to keep in this repo/config — access is governed
by the RLS policies in the migration, not by keeping this key secret. Next up
is Phase 1 step 2 (real frontend).

## Phase 1, step 2 — real frontend (DONE)

React + Vite app in `web/`, Company/By-Unit dashboard wired to live Supabase
data, deployed and auto-deploying from `master`:

- GitHub: https://github.com/mmcquary87/clg-fleet-maintenance
- Live site: https://clg-fleet-maintenance.vercel.app
- Vercel project root directory: `web`
- Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values
  as above, set for Production and Preview)

Any commit pushed to `master` auto-redeploys the live site.

## Auth (DONE)

Invite-only Supabase Auth. `profiles` table (dispatcher/mechanic/admin,
default dispatcher) auto-created per user via a trigger on `auth.users`.
Data tables' RLS tightened from "anyone with the anon key" to "logged-in
users only" — see
[supabase/migrations/20260826130000_auth_profiles.sql](supabase/migrations/20260826130000_auth_profiles.sql).

To invite someone: Supabase dashboard -> Authentication -> Users -> Invite
user. They land on a "set your password" screen via the emailed link.
Public signup is off. Supabase Auth -> URL Configuration should have Site
URL set to the production URL and both the production and localhost URLs
allow-listed under Redirect URLs.

## Phase 1, step 3 — invoice upload + Claude-API scanning (DONE)

**Part A — manual entry + receipt upload**: New Work Order form supports
multiple services per visit (unit/vendor/dates/invoice-ref/receipt shared,
each service has its own category/description/cost) — see
[supabase/migrations/20260827000000_invoice_storage.sql](supabase/migrations/20260827000000_invoice_storage.sql)
(adds `work_orders.receipt_path` + private `invoices` storage bucket) and
[web/src/components/NewWorkOrderForm.jsx](web/src/components/NewWorkOrderForm.jsx).

**Part B — AI auto-fill**: "Scan with AI" button appears once a receipt file
is attached. Calls the `scan-invoice` Supabase Edge Function
([supabase/functions/scan-invoice/index.ts](supabase/functions/scan-invoice/index.ts)),
which sends the file to the Claude API (strict tool use for structured
output — the SDK's `zodOutputFormat` helper fails to load in Supabase's Deno
runtime, so this uses a raw JSON-schema tool instead) and returns
vendor/category/cost/date/invoiceRef/description/unitNumberGuess to pre-fill
the form. Requires the `ANTHROPIC_API_KEY` secret (Edge Functions ->
Secrets, already set). Deployed via the Supabase dashboard's "Via Editor"
flow, not the CLI.

Validated against a real invoice from the SPEC.md proof-of-concept set —
correctly extracted vendor, category, and cost.

## Alvys integration — historical import (DONE), periodic sync (NOT YET BUILT)

Credentials: `ALVYS_CLIENT_ID` / `ALVYS_CLIENT_SECRET` (Edge Function secrets),
OAuth 2.0 client-credentials flow against `auth.alvys.com`. Full API
reference: https://docs.alvys.com/en/api (127 endpoints; Maintenance is
read-only — no way to write work orders back into Alvys).

- `alvys-sync-equipment`: pulls all trucks/trailers, upserts into `units`
  matched by number. Confirmed: 131 trucks + 110 trailers.
- `alvys-import-maintenance`: pulls all maintenance records, classifies
  Alvys's free-text category into our 9-category enum via keyword
  heuristic, imports as Closed work orders. Confirmed: 1,670 records
  imported, 0 skipped.
- Both are idempotent (upsert by `alvys_asset_id` / `alvys_maintenance_id`)
  — safe to re-run by hand any time via each function's Test button.
- **Not built yet**: an automatic recurring sync (cron/schedule) to pick up
  new Alvys records going forward — right now this is a manual one-time
  historical backfill, re-run by hand.
- Found and fixed during setup: Alvys's `Page` search parameter is
  **0-indexed**, not 1-indexed — easy to get wrong against their docs.

## Samsara integration (DONE — manual pull, no recurring schedule yet)

Credential: `SAMSARA_API` secret (plain bearer token, not OAuth). Base URL
`https://api.samsara.com`. Full docs: developers.samsara.com.

`samsara-sync` Edge Function does, in one run:
1. Pulls the vehicle roster, matches to `units` by VIN, sets
   `units.samsara_vehicle_id`.
2. Pulls fault codes (OBD-II + J1939), last 7 days, into `fault_events`.
3. Pulls latest fuel %/odometer/location (last 24h) into `units`
   (`last_fuel_percent`, `odometer`, `current_location`, `samsara_synced_at`).
4. Pulls DVIR defects, last 30 days, into `dvir_defects`.

Confirmed working: 68 vehicles found, 51 matched to units by VIN, 1,607
fault code readings imported, 1 DVIR defect imported (most of the other 37
found defects belong to the 17 unmatched vehicles).

**Known follow-ups, not urgent:**
- 17 of 68 vehicles didn't match any unit by VIN — worth checking whether
  that's a VIN formatting mismatch or units genuinely missing from our
  system.
- The fuel/odometer/location pull processes some vehicles more than once
  per run (duplicate entries across paginated pages) — harmless (idempotent
  re-writes) but wasteful; not yet root-caused.
- Read-only against Samsara — no write-back (e.g. marking a DVIR defect
  resolved when its work order closes), and no recurring schedule (cron)
  yet. Matches the design spec's phasing: hold off on the live/ops-critical
  half of this (webhooks, write-back) until there's monitoring in place.
- Debugging notes: two Postgres NOT NULL violations were hit and fixed
  during setup — Supabase's `.upsert()` with a partial column set still
  validates NOT NULL constraints on the full row before checking for a
  conflict, so updating an existing row via upsert with only 1-2 columns
  set can fail. Fixed by using per-row `.update()` (fired concurrently via
  `Promise.all`, not sequentially) instead of a bulk upsert wherever rows
  might only get partial data.

---

## Original step 1 walkthrough (for reference)

I can't create the Supabase account/project for you (that requires you to sign
up), but everything after that is copy/paste. No Node.js or CLI tools needed
for this step.

## 1. Create the project

1. Go to https://supabase.com and sign in (or create an account).
2. **New project** — name it something like `clg-fleet-maintenance`, pick a
   region close to Georgia/Florida (e.g. `us-east-1`), set a database
   password and save it somewhere safe (a password manager, not this repo).
3. Wait for provisioning (~2 min).

## 2. Run the schema

1. In the project sidebar: **SQL Editor** -> **New query**.
2. Paste the contents of
   [supabase/migrations/20260826120000_init_schema.sql](supabase/migrations/20260826120000_init_schema.sql)
   and click **Run**.
3. **Table Editor** in the sidebar — confirm you see `units`, `vendors`,
   `work_orders`, `fault_events`, `dvir_defects`, all empty.

Real records (units, vendors, work orders) get entered later through the app
once it's built — not seeded here. `supabase/example_data.sql` in this repo
holds the 6 example work orders from SPEC.md's invoice proof-of-concept;
it's kept around only as a reference dataset for testing the dashboard and
invoice scanner, and is not part of this setup — don't run it against the
real project.

## 3. Get the connection info

**Project Settings -> API**. Two values matter for the frontend build (step 2):

- **Project URL** (e.g. `https://xxxxx.supabase.co`) — safe to share, goes in
  frontend config.
- **anon public key** — safe to share, this is what the browser uses; access
  is governed by the row-level-security policies in the migration, not by
  keeping this key secret.
- **service_role key** — do **not** share this or put it in frontend code.
  Only needed later for the Samsara/invoice-scanner backend functions
  (Phase 2 / step 3), and only as a server-side env var.

Paste the Project URL and anon public key back here when you have them and
I'll wire up the real frontend against them (step 2 of Phase 1 — the
Company/By-Unit dashboard from
[extracted/fleet-dashboard-full.jsx](extracted/fleet-dashboard-full.jsx)).

## Note on this machine

Node.js/npm isn't installed here, so I can't run the Supabase CLI or a local
React dev server directly — the SQL Editor route above sidesteps that for
now. We'll need Node installed before step 2 (building the real React
frontend) either way; flag if you'd like help with that when we get there.
