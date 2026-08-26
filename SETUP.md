# Phase 1, step 1 — stand up Supabase (DONE)

Project: `CLG Transportation` (ref `fxveuksdxjovgsxrevpa`), schema migrated in,
5 empty tables confirmed.

- Project URL: `https://fxveuksdxjovgsxrevpa.supabase.co`
- Publishable (anon) key: `sb_publishable_bXWQvA_5uFdZMDU9DNaHtA_zxaGrAAD`

Both values above are safe to keep in this repo/config — access is governed
by the RLS policies in the migration, not by keeping this key secret. Next up
is Phase 1 step 2 (real frontend).

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
once it's built — not seeded here. `supabase/seed.sql` in this repo holds the
6 example work orders from SPEC_1.md's invoice proof-of-concept; it's kept
around only as a reference dataset for testing the dashboard and invoice
scanner later, and is not part of this setup — don't run it against the real
project.

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
