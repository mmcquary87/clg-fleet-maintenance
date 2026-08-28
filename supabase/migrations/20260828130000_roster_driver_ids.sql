-- Fleet Maintenance System — link roster/home-time records to a real
-- driver, not just a free-text name.
--
-- Confirmed: trips/search's Driver1.Id and drivers/search's Id are the
-- same identifier space (both "DR" + long numeric string) — sampleDriver1
-- diagnostic vs. a synced drivers row matched format. This lets KPI 17
-- cross-reference a planned home-time date against real trip activity for
-- that exact driver, instead of a fragile name-string match.
--
-- Nullable: a driver added via "+ Add a new driver" (not yet in Alvys)
-- has no id to link to yet.

alter table driver_roster add column if not exists driver_id text references drivers(id);
alter table planned_home_time add column if not exists driver_id text references drivers(id);

create index if not exists idx_driver_roster_driver_id on driver_roster(driver_id);
create index if not exists idx_planned_home_time_driver_id on planned_home_time(driver_id);
