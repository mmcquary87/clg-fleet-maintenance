-- A single invoice with multiple line items (categories) still creates one
-- work_orders row per line item -- that's unchanged, Spend/Board/CSV/Intacct
-- export/chargebacks all key off one category+cost per row. This column
-- just lets the UI recognize "these rows came from the same invoice" and
-- show them bundled as one work order, instead of as N unrelated ones.
--
-- DEFAULT gen_random_uuid() is volatile, so backfilling existing rows gives
-- each one its OWN distinct id (never accidentally grouping unrelated
-- pre-existing work orders) -- new rows created together explicitly share
-- one id, set by the app at insert time.
alter table work_orders add column work_order_group_id uuid not null default gen_random_uuid();

create index idx_work_orders_group_id on work_orders(work_order_group_id);
