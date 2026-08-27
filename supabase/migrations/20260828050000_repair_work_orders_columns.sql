-- Fleet Maintenance System — repair: fill in any columns from
-- 20260827010000_downtime_platform.sql that didn't make it into the live
-- database. Confirmed missing: work_orders.waiting_on_parts (surfaced as
-- "column work_orders.waiting_on_parts does not exist" on Board and in
-- the new Work Order detail view) — sibling columns from the same
-- migration (severity, approval_status, complaint) are confirmed present,
-- so this was a partial application, not a fully-skipped migration.
--
-- Every statement below is IF NOT EXISTS — safe to run even for columns
-- that already exist; only fills genuine gaps.

alter table work_orders add column if not exists severity wo_severity not null default 'Routine';
alter table work_orders add column if not exists system_component text;
alter table work_orders add column if not exists complaint text;
alter table work_orders add column if not exists intake_source wo_intake_source not null default 'manual';

alter table work_orders add column if not exists assigned_bay text;
alter table work_orders add column if not exists assigned_tech text;
alter table work_orders add column if not exists waiting_on_parts boolean not null default false;
alter table work_orders add column if not exists parts_eta date;

alter table work_orders add column if not exists approval_status wo_approval_status not null default 'not_required';
alter table work_orders add column if not exists approved_by text;
alter table work_orders add column if not exists approved_at timestamptz;
alter table work_orders add column if not exists po_number text;
alter table work_orders add column if not exists promised_back timestamptz;

alter table work_orders add column if not exists warranty_recovery_amount numeric(10, 2);

create index if not exists idx_work_orders_approval_status on work_orders(approval_status);
create index if not exists idx_work_orders_severity on work_orders(severity);
