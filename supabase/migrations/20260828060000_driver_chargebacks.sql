-- Fleet Maintenance System — driver chargebacks/deductions.
-- Lets a service line item on a work order be flagged as a cost that gets
-- charged back to a driver (e.g. preventable damage), with the driver's
-- name captured at log time. No drivers table exists yet, so this is a
-- free-text name rather than a foreign key.

alter table work_orders add column if not exists is_chargeback boolean not null default false;
alter table work_orders add column if not exists chargeback_driver_name text;

create index if not exists idx_work_orders_is_chargeback on work_orders(is_chargeback) where is_chargeback;
