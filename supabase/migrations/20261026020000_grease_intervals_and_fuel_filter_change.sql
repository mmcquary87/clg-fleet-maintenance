-- Fleet Maintenance System — grease intervals + fuel filter correction
-- (2026-10-26 follow-up to 20261026010000_additional_pm_intervals.sql).

-- Fuel Filter's default interval was set at 50,000 mi; CLG's real number
-- is 40,000 mi. Also backfill any unit still sitting on the old default
-- (nobody's had a chance to customize this per-unit yet, since the
-- milestone was only just added) so every truck reflects the real number
-- right away rather than needing a one-by-one re-save.
alter table units alter column fuel_filter_interval_miles set default 40000;
update units set fuel_filter_interval_miles = 40000 where fuel_filter_interval_miles = 50000;

-- Grease Fifth Wheel -- trailer-only, quarterly (364 / 4 = 91 days, same
-- "not quite 365" rounding Annual Inspection already uses).
alter table units add column last_grease_fifth_wheel_date date;
alter table units add column grease_fifth_wheel_interval_days integer default 91;

-- Grease Chassis -- tractor-only, monthly (364 / 12 ≈ 30 days).
alter table units add column last_grease_chassis_date date;
alter table units add column grease_chassis_interval_days integer default 30;
