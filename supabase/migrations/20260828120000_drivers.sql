-- Fleet Maintenance System — canonical driver list, synced from Alvys.
--
-- Confirmed via alvys-explore-drivers: Alvys's public API (drivers/search,
-- with IsActive:true or false) carries real driver names, license/medical
-- expiration dates, and an Id that should match trips/search's Driver1.Id
-- (unconfirmed until cross-checked against a real trip). This is the
-- driver directory this app has been missing — no client-side writes,
-- only the sync function (service role) populates it.

create table drivers (
  id text primary key, -- Alvys driver Id, e.g. "DR2516610261392109655"
  employee_id text,
  name text not null,
  email text,
  phone_number text,
  driver_type text, -- OWNER_OPERATOR | COMPANY
  fleet_id text,
  fleet_name text,
  status text, -- ONLINE/OFFLINE/ON DUTY/OFF DUTY/DRIVING/SLEEPING — last synced snapshot
  is_active boolean not null default true,
  license_expires_at date,
  medical_expires_at date,
  hired_at date,
  synced_at timestamptz not null default now()
);

create index idx_drivers_name on drivers(name);
create index idx_drivers_is_active on drivers(is_active);

alter table drivers enable row level security;
create policy "drivers_select_all" on drivers for select using (auth.role() = 'authenticated');
-- No client write policy — only the service-role sync function writes here.
