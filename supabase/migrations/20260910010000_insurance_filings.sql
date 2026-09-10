-- Fleet Maintenance System — insurance monthly filing record
--
-- Backs the Insurance page's "Mark as Filed" action (design package,
-- 2026-09-10). Without this, that button would be a working control with
-- nothing behind it -- clicking it needs to actually persist that this
-- reporting month's filing happened, with what numbers, so the page can
-- show "Filed" instead of a due-date countdown on a later visit, and so
-- there's a real record of what was submitted if the insurer or CLG ever
-- needs to check it later.

create table insurance_filings (
  reporting_month date primary key, -- always the 1st of the reporting month
  filed_at timestamptz not null default now(),
  filed_by uuid references auth.users(id) on delete set null,
  fleet_mileage integer not null,
  equipment_value numeric(12, 2) not null,
  estimated_premium numeric(10, 2) not null
);

alter table insurance_filings enable row level security;
create policy "authenticated_all_insurance_filings" on insurance_filings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
