-- Fleet Maintenance System — driver safety scoring prerequisites
--
-- Two gaps found while building the scoring layer:
--
-- 1. driver_speeding_intervals has no driver linkage at all.
--    /speeding-intervals/stream only ever returns a vehicle (asset) id,
--    never a driver — unlike safety-events and hos/violations, which both
--    carry driver.id directly. The scoring formula needs speeding points
--    attributed per driver, so this adds samsara_driver_id/driver_id
--    columns, resolved (by the sync function, not here) from each
--    vehicle's staticAssignedDriver on /fleet/vehicles — an approximation
--    that's accurate for CLG's typical one-driver-per-truck setup, less so
--    for team-driven trucks (same known limitation already documented in
--    samsara-hos-sync for HOS clocks).
--
-- 2. The scoring formula's 14-day "grace period" (new drivers get a blank
--    score, not a punishing low one) needs each driver's Samsara
--    createdAtTime, which was being fetched from /fleet/drivers but never
--    persisted anywhere.

alter table driver_speeding_intervals add column if not exists samsara_driver_id text;
alter table driver_speeding_intervals add column if not exists driver_id text references drivers(id);
create index if not exists idx_driver_speeding_intervals_driver_id on driver_speeding_intervals(driver_id);

alter table drivers add column if not exists samsara_driver_created_at timestamptz;
