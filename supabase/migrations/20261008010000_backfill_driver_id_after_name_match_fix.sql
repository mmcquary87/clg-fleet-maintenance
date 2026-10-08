-- Fleet Maintenance System — backfill driver_id after the name-matching fix
--
-- samsara-sync-driver-safety's suffix/middle-name fallback matching
-- (2026-10-07) linked 13 more drivers' samsara_driver_id that exact
-- matching had missed. But every safety event / HOS violation / speeding
-- interval that synced BEFORE that fix already has driver_id = null for
-- those drivers, permanently -- upserts only touch the columns in the
-- upserted row, they never retroactively backfill driver_id onto rows
-- already written with a different (null) value. Without this, those 13
-- drivers would keep showing artificially perfect scores no matter how
-- much real history accumulates, since their historical rows can never
-- attribute to them.
--
-- One-time correction: fill driver_id wherever samsara_driver_id is known
-- and already maps to a drivers row, but driver_id was left null.

update driver_safety_events dse
set driver_id = d.id
from drivers d
where dse.samsara_driver_id = d.samsara_driver_id
  and dse.driver_id is null
  and d.samsara_driver_id is not null;

update driver_hos_violations dhv
set driver_id = d.id
from drivers d
where dhv.samsara_driver_id = d.samsara_driver_id
  and dhv.driver_id is null
  and d.samsara_driver_id is not null;

update driver_speeding_intervals dsi
set driver_id = d.id
from drivers d
where dsi.samsara_driver_id = d.samsara_driver_id
  and dsi.driver_id is null
  and d.samsara_driver_id is not null;

update driver_fuel_energy dfe
set driver_id = d.id
from drivers d
where dfe.samsara_driver_id = d.samsara_driver_id
  and dfe.driver_id is null
  and d.samsara_driver_id is not null;
