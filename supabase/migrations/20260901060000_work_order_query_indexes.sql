-- Fleet Maintenance System — indexes matching the query shapes hooks
-- actually use
--
-- init_schema.sql indexes unit_id/vendor_id/status/category/date_closed on
-- work_orders, but almost every list/rollup hook (useWorkOrders,
-- useAllWorkOrders, useMechanicQueue, useBoard, useUnitActivity,
-- useVendorActivity, useDeductions) filters `.eq("voided", false)` -- with
-- no index at all -- and several order/filter by date_opened rather than
-- date_closed, also unindexed. Cheap to add now; matters once work_orders
-- grows past a few thousand rows.

create index if not exists idx_work_orders_date_opened on work_orders(date_opened);

-- Partial index for the single most common combined predicate across the
-- hooks above: "non-voided work orders, ordered by date_opened."
create index if not exists idx_work_orders_not_voided_date_opened
  on work_orders(date_opened) where voided = false;
