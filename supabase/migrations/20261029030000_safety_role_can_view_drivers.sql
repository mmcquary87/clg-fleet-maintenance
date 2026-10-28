-- Fleet Maintenance System — let Safety view the Driver Safety Scorecard

-- Bug: amcquary@clgdelivers.com (profiles.role = 'safety') saw "0 drivers
-- scored" on the Driver Safety Scorecard no matter which date range was
-- picked. drivers_select_dispatcher_admin (20260906010000, written to keep
-- CDL/medical-card data off a general "any authenticated user" policy)
-- only allows role in ('admin', 'dispatcher'). driver_safety_scorecard and
-- driver_safety_scorecard_range() both do `from drivers d ...` and are
-- plain (non security definer) SQL, so they run under the calling user's
-- own RLS -- Safety's SELECT against drivers silently returned zero rows,
-- zeroing out every scored driver regardless of window. Not a data/sync
-- bug; the window picker was a red herring.
--
-- 20261028010000 already widened driver_incidents' write policy to
-- admin+safety for this same reason ("Safety is exactly who runs this
-- program day to day") but explicitly left this table's policy alone,
-- treating it as a separate, unrelated feature -- it wasn't, once Safety
-- became the Driver Safety/Accountability program's actual owner. Same
-- role in (...) widening, not reopening the table to every authenticated
-- user: CDL/medical visibility stays restricted to admin/dispatcher/safety,
-- same roles 20260906010000 already trusted with it one role further.
drop policy "drivers_select_dispatcher_admin" on drivers;
create policy "drivers_select_dispatcher_admin_safety" on drivers for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'dispatcher', 'safety'))
);
