-- Fleet Maintenance System — work order activity log
--
-- Who did what to a work order, and when -- created, status changes,
-- closed, voided/unvoided, deleted, payment marked/reopened, chargeback
-- deduction toggled, details edited, an invoice added. Same spirit as
-- roster_change_log (20260828100000_driver_roster.sql): written
-- explicitly by application code at each write point, not derived via
-- triggers, so the "detail" text can describe the change in plain
-- language instead of a raw column diff.
--
-- work_order_id is nullable with ON DELETE SET NULL (not CASCADE) and
-- wo_number is denormalized onto the log row itself -- the whole point of
-- logging a deletion is that the entry survives the work order being
-- gone, so it can't key its own meaning off a FK that's about to vanish.
--
-- No update/delete policy on this table at all (append-only from the
-- app's perspective) -- an audit trail that can be edited after the fact
-- isn't one.
create table if not exists work_order_activity_log (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete set null,
  wo_number text not null,
  action text not null,
  actor text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wo_activity_log_work_order_id on work_order_activity_log(work_order_id);
create index if not exists idx_wo_activity_log_wo_number on work_order_activity_log(wo_number);
create index if not exists idx_wo_activity_log_created_at on work_order_activity_log(created_at);

alter table work_order_activity_log enable row level security;
create policy "wo_activity_log_select_all" on work_order_activity_log for select using (auth.role() = 'authenticated');
create policy "wo_activity_log_insert_all" on work_order_activity_log for insert with check (auth.role() = 'authenticated');
