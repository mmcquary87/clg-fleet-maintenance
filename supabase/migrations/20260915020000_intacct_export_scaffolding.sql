-- Fleet Maintenance System — Sage Intacct AP Bills export scaffolding
-- (2026-09-15)
--
-- Groundwork for exporting closed, vendor-billed work orders as AP bills
-- CLG can import into Sage Intacct (DESIGN_QUEUE.md's "Sage Intacct
-- integration" item, part 1). Three pieces:
--
-- 1. exported_to_intacct_at on work_orders -- marks a row as already sent
--    in a prior export batch, so the next month's export doesn't
--    re-include it. Independent of payment_status: exporting means "sent
--    to Sage as a bill to pay," paid means "Sage/accounting actually paid
--    it" -- two different moments in the same bill's life, not the same
--    fact twice.
--
-- 2. wo_category_gl_accounts -- one GL account number per work order
--    category, edited in Settings. category is plain text, NOT a foreign
--    key to the wo_category Postgres enum -- deliberately sidesteps the
--    same enum-drift trap "Tow" caused (20260908020000): validated
--    against CATEGORIES in web/src/lib/categories.js at the application
--    layer instead of needing a matching DB migration every time the
--    category list changes.
--
-- 3. vendors.intacct_vendor_id / app_settings.default_payment_terms --
--    the vendor cross-reference and default payment-terms value the
--    export needs per Intacct's real Bills import template (confirmed
--    from CLG's own uploaded template, 2026-09-11): VENDOR_ID is
--    required; TERM_NAME lets Intacct compute DUE_DATE itself instead of
--    this app guessing at day-count math (DUE_DATE is only required when
--    TERM_NAME is blank, per the template's own field spec).

alter table work_orders add column if not exists exported_to_intacct_at timestamptz;

create table if not exists wo_category_gl_accounts (
  category text primary key,
  gl_account_number text
);

-- Seed one row per real category so the Settings panel has something to
-- render/edit immediately rather than needing insert-on-first-edit logic.
-- Kept in sync with CATEGORIES in categories.js by hand, same as every
-- other place that list is duplicated (see CLAUDE.md's category note).
insert into wo_category_gl_accounts (category, gl_account_number) values
  ('PM / Oil', null), ('Tires', null), ('Brakes', null), ('Engine', null),
  ('Electrical', null), ('Transmission', null), ('Trailer / Body', null),
  ('DOT Inspection', null), ('Tow', null), ('Other', null)
on conflict (category) do nothing;

alter table vendors add column if not exists intacct_vendor_id text;

alter table app_settings add column if not exists default_payment_terms text;

alter table wo_category_gl_accounts enable row level security;
create policy "authenticated_all_wo_category_gl_accounts" on wo_category_gl_accounts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
