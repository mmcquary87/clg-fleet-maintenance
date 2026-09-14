-- Fleet Maintenance System — fixed owner-operator chargeback amount
--
-- CLG is moving to charging owner-operators a flat amount per chargeback
-- (2026-09-11) instead of passing through the work order's actual cost.
-- Starts null ("not configured") rather than a guessed number, same
-- reasoning as asset_single_invoice_threshold in 20260906000000_asset_lifecycle.sql
-- -- a missing rate should read as "not set yet", not silently compute as $0.

alter table app_settings add column if not exists owner_operator_chargeback_amount numeric(10, 2);
