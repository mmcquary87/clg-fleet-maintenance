-- Fleet Maintenance System — restrict driver license/medical visibility
--
-- CDL and medical-card expiration dates were readable by any authenticated
-- user via the open "drivers_select_all" policy (20260828120000_drivers.sql)
-- -- flagged in the Growth Roadmap's compliance callout and confirmed by
-- CLG (2026-09-04): this data should be role-specific and protected.
-- Replaces the blanket policy with one scoped to admin/dispatcher, the same
-- roles as the roster's write policy (20260828100000_driver_roster.sql) --
-- not the mechanic role's day-to-day view, same line CLG drew for the
-- Asset Lifecycle tile.
--
-- A mechanic-role user browsing Reloads or Tracking (both still
-- nav-visible to every role) simply sees a blank driver name on those
-- joins now instead of an error -- neither page is a mechanic's normal
-- workflow, and no page restricted to the mechanic role reads this table.

drop policy if exists "drivers_select_all" on drivers;

create policy "drivers_select_dispatcher_admin" on drivers for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'dispatcher'))
);
