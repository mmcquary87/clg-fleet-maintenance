-- Fleet Maintenance System — five more per-unit maintenance milestones,
-- same pattern as PM/Oil (last-done + interval, mileage and/or date) --
-- see maintenanceSchedule.js's MILESTONES array for how each is tracked.
-- Defaults below are CLG's own stated intervals (2026-10-26); still
-- editable per unit on the Unit detail page, same as every other milestone.

-- Transmission Fluid -- mileage only, no date tracked.
alter table units add column last_transmission_fluid_odometer integer;
alter table units add column transmission_fluid_interval_miles integer default 250000;

-- Engine Air Filter -- mileage-primary (150,000 mi), annual date fallback
-- for a unit with no odometer-tracked change on file yet, same "prefer
-- mileage, fall back to date" rule PM/Oil already uses.
alter table units add column last_engine_air_filter_date date;
alter table units add column engine_air_filter_interval_days integer default 364;
alter table units add column last_engine_air_filter_odometer integer;
alter table units add column engine_air_filter_interval_miles integer default 150000;

-- Cabin Air Filter -- date only (annual), no mileage dependency.
alter table units add column last_cabin_air_filter_date date;
alter table units add column cabin_air_filter_interval_days integer default 364;

-- Differential Oil Change -- mileage only, no date tracked.
alter table units add column last_differential_oil_odometer integer;
alter table units add column differential_oil_interval_miles integer default 250000;

-- Fuel Filter -- both tracked at once, due at whichever comes first
-- (6 months or 50,000 mi).
alter table units add column last_fuel_filter_date date;
alter table units add column fuel_filter_interval_days integer default 182;
alter table units add column last_fuel_filter_odometer integer;
alter table units add column fuel_filter_interval_miles integer default 50000;
