-- Fleet Maintenance System — delete-authority for work orders
--
-- Found during the 2026-10-12 security review: work_orders' own RLS
-- ("authenticated_all_work_orders", 20260826130000) grants full
-- read/write/DELETE to any authenticated user -- unlike voiding (soft
-- delete, 20260901020000_work_order_void.sql), which is already gated to
-- admins plus a can_void_work_orders flag via a trigger, hard-deleting a
-- work order currently has NO restriction at all.
--
-- Mirrors that same admin-plus-flag pattern for real DELETE. Voiding stays
-- the normal way to retract a work order (reversible, keeps history) --
-- this is for the rarer case of removing a row outright (e.g. an invoice
-- that got split into extra work orders by mistake, per 2026-10-12).

alter table profiles add column if not exists can_delete_work_orders boolean not null default false;

create or replace function enforce_work_order_delete_permission()
returns trigger as $$
begin
  if not exists (
    select 1 from profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.can_delete_work_orders)
  ) then
    raise exception 'Only admins or users with delete permission can delete work orders';
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists work_order_delete_permission_trigger on work_orders;
create trigger work_order_delete_permission_trigger
  before delete on work_orders
  for each row execute function enforce_work_order_delete_permission();
