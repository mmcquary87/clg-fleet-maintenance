-- Fleet Maintenance System — mechanic work log (tablet-friendly repair entry)
--
-- CLG hired an in-house mechanic (2026-09-01) who needs to record repair
-- work directly from the shop floor on a tablet: what the issue was, which
-- parts were used, and how long the repair took. This is separate from the
-- existing "Close work order" flow in WorkOrderDetailModal (office-facing,
-- invoice/cost-reconciliation for a vendor bill) -- the mechanic's sheet
-- just feeds real-time shop notes into the same work_orders row that flow
-- later finalizes with cost. It never sets status to Closed itself (see
-- MechanicView.jsx) -- Closed is tied to Spend/Cost-per-mile reporting via
-- the cost field, and a mechanic logging parts/hours doesn't know final
-- vendor/parts pricing, so letting this flow close the order would risk a
-- real job showing as $0 spend until someone remembers to fix it.
--
-- Parts get their own table rather than a jsonb column since they're
-- naturally add/remove rows from a UI and might get reported on later
-- (e.g. "which parts get used most") -- same relational style as the rest
-- of this schema. unit_cost is nullable: a mechanic grabbing a part off
-- the shelf often doesn't know its price -- that's reconciled later by
-- whoever closes the work order with the real invoice, not required here.

alter table work_orders add column if not exists labor_hours numeric(6, 2);

create table work_order_parts (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  part_name text not null,
  quantity numeric(8, 2) not null default 1,
  unit_cost numeric(10, 2),
  created_at timestamptz not null default now()
);

create index if not exists idx_work_order_parts_work_order_id on work_order_parts(work_order_id);

alter table work_order_parts enable row level security;

create policy "authenticated_all_work_order_parts" on work_order_parts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
