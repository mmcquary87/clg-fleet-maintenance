-- Fleet Maintenance System — work order payment status (2026-09-15)
--
-- Tracks whether CLG has paid the vendor for a repair. Independent of the
-- work order's own status (Open/In Progress/Closed -- job done) and of
-- the driver chargeback ledger (a different money direction entirely --
-- CLG collecting FROM a driver, not paying a vendor). A work order can be
-- Closed and unpaid-by-the-driver-chargeback while its vendor invoice is
-- already paid, or any other combination of these three independent
-- facts -- this column only tracks the vendor-payable side.

create type wo_payment_status as enum ('unpaid', 'paid');

alter table work_orders add column if not exists payment_status wo_payment_status not null default 'unpaid';
-- Free text, not a DB enum -- the frontend offers a controlled list
-- (Check, ACH/Wire, Credit Card, Company Account, Net Terms, Other), same
-- reasoning as assigned_bay/assigned_tech: no other query in this schema
-- needs to filter/join on payment method, so a Postgres enum would only
-- add the same 3-place-sync risk "Tow" already burned us on for a field
-- that doesn't need it.
alter table work_orders add column if not exists payment_method text;
alter table work_orders add column if not exists payment_reference text; -- check #/confirmation #/last 4, optional
alter table work_orders add column if not exists paid_at date;

create index if not exists idx_work_orders_payment_status on work_orders(payment_status);
