-- Fleet Maintenance System — human-readable work order numbers (WO-1042)
--
-- work_orders had no internal identifier a dispatcher/mechanic could
-- reference out loud, on paper, or with a vendor before an invoice number
-- exists (invoice_ref is the VENDOR's invoice number, populated only once
-- the repair is billed). This adds a sequential wo_number assigned
-- automatically on insert, plus a one-time backfill for existing rows in
-- creation order.

create sequence if not exists work_order_number_seq start 1001;

alter table work_orders add column if not exists wo_number text unique;

create or replace function assign_wo_number()
returns trigger as $$
begin
  if new.wo_number is null then
    new.wo_number := 'WO-' || nextval('work_order_number_seq');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_wo_number on work_orders;
create trigger trg_assign_wo_number
  before insert on work_orders
  for each row
  execute function assign_wo_number();

-- Backfill existing rows in creation order so history gets numbers too.
do $$
declare
  r record;
begin
  for r in select id from work_orders where wo_number is null order by created_at asc
  loop
    update work_orders set wo_number = 'WO-' || nextval('work_order_number_seq') where id = r.id;
  end loop;
end $$;
