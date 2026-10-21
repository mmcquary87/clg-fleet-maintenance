-- Fleet Maintenance System — per-unit equipment/supplies inventory
--
-- A simple, persistent, editable checklist of equipment/supplies kept on
-- a specific unit (fire extinguisher, tire chains, tarps, tool kit, ...),
-- distinct from everything else "inventory"-adjacent in this app:
--   - work_order_parts.category (20260918080000) is shop-parts
--     classification on a work order line item, explicitly not an
--     inventory system (no stock/SKU/reorder tracking).
--   - tractor_inspections' EQUIPMENT_ITEMS (tractorInspectionItems.js) is
--     a point-in-time pass/fail snapshot tied to one inspection record,
--     not a standing list you browse/edit per unit.
-- This table is the standing list: free-form item names (seeded via a
-- "Add common items" convenience button in the UI, not a fixed enum, so a
-- unit can carry whatever it actually has), each with a status and
-- optional notes, same authenticated-write RLS pattern as unit_checkins/
-- unit_documents (20260907040000) -- not HR/disciplinary data, no need
-- for the roster-style per-user permission flag.
create table if not exists unit_inventory_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  item_name text not null,
  status text not null default 'present' check (status in ('present', 'missing', 'damaged')),
  notes text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_unit_inventory_items_unit_id on unit_inventory_items(unit_id);

alter table unit_inventory_items enable row level security;
create policy "authenticated_all_unit_inventory_items" on unit_inventory_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
