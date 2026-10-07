-- Fleet Maintenance System — fix: driver_safety_events.samsara_driver_id
-- must be nullable.
--
-- Confirmed against real data running samsara-sync-driver-safety: some
-- Samsara safety events carry no driver (e.g. a vehicle-only trigger with
-- no driver logged in at the time), so the "not null" constraint added in
-- 20261007000000_driver_safety_scorecard.sql was too strict and broke the
-- very first real sync run.

alter table driver_safety_events alter column samsara_driver_id drop not null;
