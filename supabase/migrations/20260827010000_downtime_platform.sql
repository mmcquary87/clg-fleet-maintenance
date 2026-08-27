-- Fleet Maintenance System — downtime-clock platform data model
-- Run this in the Supabase SQL Editor after 20260827000000_invoice_storage.sql.
--
-- Extends the Phase 1 schema to support the hybrid design direction from
-- the "Maintenance Software Platform Design" handoff: turn 2 (unit-centric
-- board + downtime clock) as primary, turn 1 (flat approval queue) as a
-- secondary view. See design_handoff/ for the source design doc.
--
-- Alvys integration is not built yet, so every Alvys-sourced field here is
-- nullable and has a manual-entry fallback, per the handoff's own guidance
-- ("offer a manual-entry path instead" for units not yet in the TMS).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type wo_severity as enum ('Unit down', 'Urgent', 'Routine');

create type wo_intake_source as enum (
  'breakdown_call', 'dvir', 'pm_due', 'roadside', 'inspection', 'walk_around', 'manual'
);

create type wo_approval_status as enum ('not_required', 'needs_approval', 'approved', 'declined');

-- ---------------------------------------------------------------------------
-- units — cost-of-waiting + Alvys/asset enrichment (all nullable, manual
-- fallback until the Alvys integration exists)
-- ---------------------------------------------------------------------------

alter table units add column hourly_revenue_rate numeric(10, 2);
alter table units add column idle_since timestamptz;
alter table units add column can_move_load boolean not null default true;

-- Alvys/asset fields — same intent as SPEC.md's Samsara enrichment fields,
-- broadened to cover what the design doc's Alvys read-only panel expects.
alter table units add column driver_name text;
alter table units add column current_location text;
alter table units add column odometer integer;
alter table units add column load_trip_id text;
alter table units add column domicile text;
alter table units add column last_pm_date date;
alter table units add column warranty_status text;
alter table units add column alvys_synced_at timestamptz;

-- ---------------------------------------------------------------------------
-- work_orders — severity, system/component, assignee, approval workflow
-- ---------------------------------------------------------------------------

alter table work_orders add column severity wo_severity not null default 'Routine';
alter table work_orders add column system_component text; -- e.g. "Air compressor" — finer than category
alter table work_orders add column complaint text; -- driver/dispatch-reported issue, distinct from `description` (work performed)
alter table work_orders add column intake_source wo_intake_source not null default 'manual';

alter table work_orders add column assigned_bay text; -- in-house assignment
alter table work_orders add column assigned_tech text; -- in-house assignment

alter table work_orders add column approval_status wo_approval_status not null default 'not_required';
alter table work_orders add column approved_by text;
alter table work_orders add column approved_at timestamptz;
alter table work_orders add column po_number text;
alter table work_orders add column promised_back timestamptz;

alter table work_orders add column warranty_recovery_amount numeric(10, 2); -- $ potentially recoverable under vendor/mfr warranty

create index idx_work_orders_approval_status on work_orders(approval_status);
create index idx_work_orders_severity on work_orders(severity);

-- ---------------------------------------------------------------------------
-- work_order_activity — the comment/activity feed on #1d
-- ---------------------------------------------------------------------------

create table work_order_activity (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  actor text not null, -- display name/email; not a hard FK to profiles so system-generated entries work too
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_work_order_activity_wo_id on work_order_activity(work_order_id);

alter table work_order_activity enable row level security;
create policy "authenticated_all_work_order_activity" on work_order_activity
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- app_settings — single-row config. Approval threshold starts as a global
-- constant (design doc's assumption: $500) rather than per-terminal, since
-- there's no terminals/locations concept yet. Revisit if that's needed.
-- ---------------------------------------------------------------------------

create table app_settings (
  id boolean primary key default true, -- singleton row trick: only one row can ever exist
  approval_threshold numeric(10, 2) not null default 500,
  constraint app_settings_singleton check (id)
);

insert into app_settings (id) values (true);

alter table app_settings enable row level security;
create policy "authenticated_read_app_settings" on app_settings for select using (auth.role() = 'authenticated');
create policy "authenticated_update_app_settings" on app_settings for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
