-- Fleet Maintenance System — void/un-void work orders
--
-- A soft delete, not a hard one: a voided work order stays in the table
-- (full history, nothing lost) but is excluded from every spend/cost
-- rollup and from the Board's active-work tracking. Kept as a separate
-- `voided` flag rather than a new `status` value (no "Void" stage added to
-- Open-Proposed -> Open -> In Progress -> Closed) so un-voiding restores
-- exactly the status the order had before, with nothing to guess at.
--
-- Voiding is gated to admins plus whichever specific users are flagged
-- can_void_work_orders -- "admin and management," not every dispatcher/
-- mechanic who can otherwise fully edit a work order. Mirrors the
-- can_edit_roster admin-plus-flag pattern from
-- 20260828090000_roster_permissions.sql, but unlike that one this is
-- enforced with a real trigger, not just an RLS/UI check on a dedicated
-- table -- work_orders' own RLS ("authenticated_all_work_orders") grants
-- full update rights to any authenticated user, so restricting only the
-- `voided` column needs row-level logic finer than a table-wide policy.

alter table work_orders add column if not exists voided boolean not null default false;
alter table work_orders add column if not exists voided_at timestamptz;
alter table work_orders add column if not exists voided_reason text;

alter table profiles add column if not exists can_void_work_orders boolean not null default false;

create or replace function enforce_work_order_void_permission()
returns trigger as $$
begin
  if new.voided is distinct from old.voided then
    if not exists (
      select 1 from profiles p
      where p.id = auth.uid() and (p.role = 'admin' or p.can_void_work_orders)
    ) then
      raise exception 'Only admins or users with void permission can void/un-void work orders';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists work_order_void_permission_trigger on work_orders;
create trigger work_order_void_permission_trigger
  before update on work_orders
  for each row execute function enforce_work_order_void_permission();
