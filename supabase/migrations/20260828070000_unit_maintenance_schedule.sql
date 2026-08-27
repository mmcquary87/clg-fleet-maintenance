-- Fleet Maintenance System — fixed maintenance milestones per unit.
-- last_pm_date already exists (20260827010000_downtime_platform.sql). PM/Oil
-- and Midtrip intervals vary by truck make/model (CLG-confirmed), so they're
-- per-unit fields the user sets rather than one global constant. Annual
-- Inspection is a fixed 365-day interval — computed in the app, no column
-- needed for the interval itself.

alter table units add column if not exists pm_interval_days integer;
alter table units add column if not exists midtrip_interval_days integer;
alter table units add column if not exists last_annual_inspection_date date;
alter table units add column if not exists last_midtrip_date date;
