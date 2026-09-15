-- Fleet Maintenance System — owner-operator unit flag + real GL account map
-- (2026-09-16)
--
-- Two corrections after seeing CLG's real chart of accounts (2026-09-16):
--
-- 1. units.owner_operator_assigned -- a systematic safeguard for GL
--    routing, replacing reliance on a work order's "Charge Back to
--    Driver" checkbox being remembered every time. Independent of the
--    existing `ownership` enum (owned/penske_lease/hale_lease), which
--    tracks who holds legal title -- a lease-purchase truck can be
--    CLG-owned AND currently assigned to an owner-operator at the same
--    time, two different facts. This flag is the authoritative signal
--    for whether a truck's repair cost should post to the
--    Owner-Operator GL account vs the Company one, set once per truck
--    rather than re-decided on every work order.
--
-- 2. The GL account structure isn't "one account per work order
--    category" (what 20260915020000 built) -- CLG's real chart of
--    accounts splits by asset type (Truck/Trailer) and transaction type
--    (Inspection / Tires / Repairs & Maintenance [Company or
--    Owner-Operator, trucks only] / Parts), which cuts across our 10
--    categories rather than matching them one-to-one. Replaces the
--    now-unused wo_category_gl_accounts table (never populated -- every
--    row was still null) with a singleton row of named account fields,
--    same pattern as app_settings.

alter table units add column if not exists owner_operator_assigned boolean not null default false;

drop table if exists wo_category_gl_accounts;

create table gl_account_map (
  id boolean primary key default true,
  truck_inspection_account text,
  truck_tires_account text,
  truck_repairs_company_account text,
  truck_repairs_owner_operator_account text,
  truck_parts_account text,
  trailer_inspection_account text,
  trailer_tires_account text,
  trailer_repairs_account text,
  -- No distinct trailer parts account was given in CLG's chart of
  -- accounts -- defaults to trailer_repairs_account in the export unless
  -- this is filled in separately.
  trailer_parts_account text,
  constraint gl_account_map_singleton check (id)
);
insert into gl_account_map (id) values (true);

alter table gl_account_map enable row level security;
create policy "authenticated_all_gl_account_map" on gl_account_map
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
