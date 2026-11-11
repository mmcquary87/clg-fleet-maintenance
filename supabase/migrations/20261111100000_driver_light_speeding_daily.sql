-- Fleet Maintenance System — daily tally of "light" speeding (1 to <6 mph over)
--
-- Legal/compliance direction (2026-11-11): light speeding must be TRACKED, not
-- ignored. Samsara's /speeding-intervals/stream returns ~93% of all intervals
-- as "light" (one measured day: 2,846 of 3,057, ~35 s each, 0.9-6.8 mph over),
-- so storing each one in driver_speeding_intervals would grow that table ~12x
-- (~250k rows / 90 days). Instead the sync (samsara-sync-driver-safety)
-- tallies intervals under 6 mph over the posted limit per driver per UTC day
-- into this table (~3k rows / 90 days). Intervals at 6+ mph over (CLGOS's
-- Moderate/Heavy/Severe tiers, which score per event) are still stored one
-- row each in driver_speeding_intervals, regardless of Samsara's own label --
-- Samsara "light" runs up to ~6.8 mph over, so labelling by Samsara's word
-- was silently dropping events CLGOS scores as Moderate.
--
-- Tracking only: nothing reads this table into driver_safety_scorecard yet.
-- The scoring rule for light is a separate decision (see handover notes).
--
-- One row per (UTC day, Samsara driver). Intervals with no covering
-- driver-vehicle assignment are kept under samsara_driver_id = null so fleet
-- totals stay complete. The sync recomputes every day it touches in full and
-- replaces those rows, so a late-arriving assignment moves events from the
-- unattributed row to the driver without double counting.

create table if not exists driver_light_speeding_daily (
  id text primary key,                       -- '<yyyy-mm-dd>:<samsara_driver_id|unattributed>'
  day date not null,                         -- UTC calendar day of interval start
  samsara_driver_id text,
  driver_id text,
  event_count integer not null,
  total_seconds numeric not null,            -- summed interval durations
  sum_mph_over numeric not null,             -- avg mph over = sum_mph_over / event_count
  max_mph_over numeric not null,
  synced_at timestamptz not null default now()
);

create index if not exists driver_light_speeding_daily_day_idx on driver_light_speeding_daily (day);
create index if not exists driver_light_speeding_daily_driver_idx on driver_light_speeding_daily (driver_id, day);

alter table driver_light_speeding_daily enable row level security;
create policy "driver_light_speeding_daily_select_all" on driver_light_speeding_daily
  for select using (auth.role() = 'authenticated');
create policy planning_agent_deny on driver_light_speeding_daily
  as restrictive for all to authenticated
  using (not is_planning_agent()) with check (not is_planning_agent());
