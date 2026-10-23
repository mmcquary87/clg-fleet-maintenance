-- Fleet Maintenance System — real invoice line items (replaces the
-- work_order_group_id "multiple WO rows glued together" hack)
--
-- Background: 20261012010000_work_order_group_id.sql let one invoice with
-- several repair categories create N separate work_orders rows sharing a
-- group id, bundled for display only. That meant N real WO numbers, N
-- independent status/payment/void states that could (and did) drift apart
-- -- the exact incident that prompted this (WO-6588 showing as "+11").
--
-- This is the real fix: one work_orders row per invoice, with the
-- per-category cost breakdown living in this new child table instead.
-- work_orders.cost becomes the live sum of its line items (trigger below)
-- so every existing reader of work_orders.cost keeps working unchanged.
-- work_orders.category is left as whatever was set at creation (first
-- line item's category, in practice) -- informational only once line
-- items exist; anything that needs the real per-category breakdown reads
-- this table directly (Spend charts, CSV/Intacct export, Deductions).
--
-- NOT the same thing as work_order_parts (20260901040000_mechanic_work_log.sql):
-- that table is a mechanic's physical-parts-used log (quantity/unit_cost,
-- often imprecise) used to *estimate* a split of an already-fixed invoice
-- total -- it stays exactly as-is, untouched by this migration. This
-- table is the authoritative invoice breakdown itself.
--
-- Chargeback fields are duplicated here (not just on work_orders) because
-- a single multi-category invoice can have one chargeback-eligible line
-- item (e.g. a driver-caused tire blowout) alongside non-chargeback ones
-- (routine brake service) -- exactly how this worked under the old
-- one-row-per-category model, just moved down a level.
create table work_order_line_items (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  category wo_category not null,
  description text,
  cost numeric(10, 2) not null default 0,
  is_chargeback boolean not null default false,
  chargeback_driver_name text,
  chargeback_driver_id text references drivers(id),
  chargeback_deducted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_work_order_line_items_work_order_id on work_order_line_items(work_order_id);

alter table work_order_line_items enable row level security;
create policy "authenticated_all_work_order_line_items" on work_order_line_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Keeps work_orders.cost as the live sum of its line items -- but ONLY
-- once a work order actually has line items. A plain single-category work
-- order (the overwhelming majority: DVIR-raised, check-call-raised,
-- Alvys-imported, mechanic-flagged, or a single-item manual entry) never
-- gets a line item row at all and keeps setting cost directly, exactly as
-- it always has -- this trigger is a no-op for every one of those.
create or replace function sync_work_order_cost_from_line_items()
returns trigger
language plpgsql
as $$
declare
  affected_wo_id uuid;
begin
  affected_wo_id := coalesce(new.work_order_id, old.work_order_id);
  update work_orders
    set cost = coalesce((select sum(cost) from work_order_line_items where work_order_id = affected_wo_id), 0),
        updated_at = now()
    where id = affected_wo_id;
  return null;
end;
$$;

create trigger trg_sync_work_order_cost_insert_update
  after insert or update of cost on work_order_line_items
  for each row execute function sync_work_order_cost_from_line_items();

create trigger trg_sync_work_order_cost_delete
  after delete on work_order_line_items
  for each row execute function sync_work_order_cost_from_line_items();
