-- Fleet Maintenance System — shop labor rate (for in-house repair cost math)
--
-- CLG wants the mechanic's logged parts + labor hours (see
-- 20260901040000_mechanic_work_log.sql) to actually roll into a dollar
-- estimate instead of sitting as reference-only data. Labor cost needs a
-- $/hour rate to convert hours into dollars -- stored here as a single
-- shop-wide rate (same singleton-row pattern as approval_threshold),
-- editable from Settings.
--
-- Defaults to 0 rather than a guessed number: an unset rate should read as
-- "not configured yet" (the UI says so explicitly), not silently produce a
-- wrong-but-plausible-looking labor cost.

alter table app_settings add column if not exists shop_labor_rate numeric(10, 2) not null default 0;
