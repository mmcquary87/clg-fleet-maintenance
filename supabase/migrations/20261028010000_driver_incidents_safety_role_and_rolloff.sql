-- Fleet Maintenance System — Driver Accountability: let Safety log incidents
--
-- Bug: amcquary@clgdelivers.com (profiles.role = 'safety') got "new row
-- violates row-level security policy for table driver_incidents" trying to
-- use Log Incident. driver_incidents_write_admin
-- (20261007060000_driver_accountability.sql) is a single `for all` policy
-- gated to role = 'admin' only -- Safety was never included, even though
-- Safety is exactly who runs this program day to day. Widened to admin +
-- safety, same `role in (...)` list pattern Tenstreet's own tables use
-- (20261027020000_tenstreet_integration.sql) rather than opening the table
-- to every authenticated user.
--
-- Log Incident (LogIncidentForm.jsx) only ever writes to driver_incidents
-- itself -- no coaching-step/points-ledger/tasks table exists for this
-- flow -- so this is the only policy that needed the fix. The existing
-- driver_incidents_select_all policy (read, any authenticated user) is
-- untouched.
drop policy "driver_incidents_write_admin" on driver_incidents;
create policy "driver_incidents_write_admin_safety" on driver_incidents for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'safety'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'safety'))
);

-- Driver Accountability Program: infraction roll-off window 90 -> 60 days
-- (CLG direction, 2026-10-28). LogIncidentForm's "rolls off after N days"
-- text already reads rollover_days live off this table, so no frontend
-- change is needed. No scoring view currently filters by rollover_days --
-- it's a stored/displayed attribute only, not live scoring logic yet --
-- so this is purely a data change: the column default, plus the 20 seeded
-- rows that were inserted with the old 90-day default.
--
-- NOT touched: the Samsara driver-safety telemetry scorecard's unrelated
-- "trailing 90 days" window (driver_safety_scorecard view and friends) --
-- a different feature, not this infraction roll-off concept.
alter table accountability_infractions alter column rollover_days set default 60;
update accountability_infractions set rollover_days = 60 where rollover_days = 90;
