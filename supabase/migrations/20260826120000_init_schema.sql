-- Fleet Maintenance System — initial schema
-- Matches the data model in SPEC_1.md. Run this once in the Supabase SQL Editor
-- (Project -> SQL Editor -> New query) against a fresh Supabase project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type unit_type as enum ('Truck', 'Trailer', 'Van', 'Other');

create type wo_category as enum (
  'PM / Oil', 'Tires', 'Brakes', 'Engine', 'Electrical',
  'Transmission', 'Trailer / Body', 'DOT Inspection', 'Other'
);

create type wo_status as enum ('Open-Proposed', 'Open', 'In Progress', 'Closed');

create type wo_source as enum ('manual', 'samsara_fault', 'samsara_dvir');

create type fault_source as enum ('obdii', 'j1939');

create type fault_status as enum ('new', 'matched', 'dismissed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table units (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  type unit_type not null default 'Truck',
  vin text,
  samsara_vehicle_id text unique,
  created_at timestamptz not null default now()
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty_category wo_category,
  contact text,
  created_at timestamptz not null default now()
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete restrict,
  category wo_category not null,
  vendor_id uuid references vendors(id) on delete set null,
  description text,
  cost numeric(10, 2) not null default 0,
  status wo_status not null default 'Open',
  date_opened date not null default current_date,
  date_closed date,
  invoice_ref text,
  source wo_source not null default 'manual',
  samsara_reference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fault_events (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  dtc_code text not null,
  dtc_description text,
  source fault_source not null,
  samsara_reading_time timestamptz not null,
  matched_work_order_id uuid references work_orders(id) on delete set null,
  status fault_status not null default 'new',
  created_at timestamptz not null default now()
);

create table dvir_defects (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  defect_type text not null,
  samsara_defect_id text unique,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  matched_work_order_id uuid references work_orders(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Indexes for the dashboard rollups (spend by unit / category / time)
-- ---------------------------------------------------------------------------

create index idx_work_orders_unit_id on work_orders(unit_id);
create index idx_work_orders_vendor_id on work_orders(vendor_id);
create index idx_work_orders_status on work_orders(status);
create index idx_work_orders_category on work_orders(category);
create index idx_work_orders_date_closed on work_orders(date_closed);
create index idx_fault_events_unit_id on fault_events(unit_id);
create index idx_dvir_defects_unit_id on dvir_defects(unit_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for work_orders
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger work_orders_set_updated_at
  before update on work_orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- TEMPORARY dev-phase policy: allow full read/write to anon + authenticated
-- so the Phase 1 dashboard (no auth yet) can talk to Supabase directly via
-- the anon key. Per SPEC_1.md security notes, this must be replaced with
-- real role-based policies (dispatcher / mechanic / admin) before this goes
-- beyond local/internal use — do not treat this as production-ready.
-- ---------------------------------------------------------------------------

alter table units enable row level security;
alter table vendors enable row level security;
alter table work_orders enable row level security;
alter table fault_events enable row level security;
alter table dvir_defects enable row level security;

create policy "dev_all_units" on units for all using (true) with check (true);
create policy "dev_all_vendors" on vendors for all using (true) with check (true);
create policy "dev_all_work_orders" on work_orders for all using (true) with check (true);
create policy "dev_all_fault_events" on fault_events for all using (true) with check (true);
create policy "dev_all_dvir_defects" on dvir_defects for all using (true) with check (true);
