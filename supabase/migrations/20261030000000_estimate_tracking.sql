-- Fleet Maintenance System — estimate tracking on work orders
--
-- Repair shops often email an ESTIMATE before the actual repair happens,
-- followed later by a separate final invoice once the work is done --
-- same repairs inbox (Receipt Inbox) as a normal receipt, same scan-invoice
-- extraction, just a different kind of document. Previously there was no
-- way to log the estimate without either (a) waiting for the final invoice
-- to create anything (losing visibility into the probable repair/cost in
-- the meantime) or (b) creating a normal work order with a cost that was
-- never actually final and no way to tell the two apart later.
--
-- is_estimate marks a work order whose `cost` is a vendor quote, not a
-- confirmed final amount. estimated_cost preserves that original quoted
-- number even after the real invoice lands and overwrites `cost` -- the
-- variance between the two is `cost - estimated_cost`, computed where
-- needed rather than stored, since it only exists once the work order is
-- finalized.
alter table work_orders add column if not exists is_estimate boolean not null default false;
alter table work_orders add column if not exists estimated_cost numeric(10, 2);

create index if not exists idx_work_orders_is_estimate on work_orders(is_estimate) where is_estimate;
