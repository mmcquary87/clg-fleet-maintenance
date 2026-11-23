-- Fleet Maintenance System — Samsara data-coverage check for the scorecard (2026-11-23)
--
-- A Heavy Speeding event (truck 3389, 2026-11-12) was missing from the scorecard
-- because the truck was never linked to its Samsara vehicle (see
-- 20261120010000_normalize_unit_vin.sql). Nothing flagged it: a truck that is
-- not linked simply produces no speeding events, which looks the same as a
-- clean truck. This view makes that failure visible. The Driver Safety
-- (scorecard) page reads it and shows a banner whenever it returns rows.
--
-- Checks (one row per problem, none returned when everything is healthy):
--   unlinked_truck        active truck with no samsara_vehicle_id: its speeding is
--                         never fetched (no VIN on file, or VIN not in Samsara)
--   sync_stalled          the speeding sync has not written in over 60 minutes
--   unattributed_speeding more than 10% of the last 7 days of speeding events have
--                         no driver (assignment data missing, or a driver not in CLGOS)
--   no_speeding_data      active driver with 1,000+ miles in the 90-day snapshot but
--                         no speeding events and no light-speeding tally at all, i.e.
--                         the truck they drive is probably not linked
--
-- Access gate is in the view itself (same style as the planning_*_v views):
-- signed-in users only, and not the external planning agent. Not exposed to anon.
--
-- BACK OUT: drop view samsara_coverage_issues;

create or replace view samsara_coverage_issues as
with unlinked as (
  select 'warning'::text as severity, 'unlinked_truck'::text as kind, u.number::text as subject,
    case when u.vin is null
      then 'No VIN on file, so it cannot be matched to its Samsara vehicle. Its speeding is not being tracked.'
      else 'VIN ' || u.vin || ' did not match a Samsara vehicle. Its speeding is not being tracked.'
    end as detail
  from units u
  where u.type = 'Truck' and u.is_active and u.samsara_vehicle_id is null
), stalled as (
  select 'critical'::text, 'sync_stalled'::text, 'Speeding sync'::text,
    'Last speeding sync was ' || round(extract(epoch from (now() - max(synced_at))) / 60) ||
      ' minutes ago. Scores may be missing recent events.'
  from driver_light_speeding_daily
  having max(synced_at) < now() - interval '60 minutes'
), unattributed as (
  select 'warning'::text, 'unattributed_speeding'::text, 'Unattributed speeding'::text,
    count(*) filter (where driver_id is null) || ' of ' || count(*) ||
      ' speeding events in the last 7 days have no driver (' ||
      round(100.0 * count(*) filter (where driver_id is null) / nullif(count(*), 0)) || '%).'
  from driver_speeding_intervals
  where start_time > now() - interval '7 days'
  having count(*) > 0 and count(*) filter (where driver_id is null)::numeric / count(*) > 0.10
), nodata as (
  select 'warning'::text, 'no_speeding_data'::text, d.name::text,
    round(f.distance_traveled_meters * 0.000621371) ||
      ' miles driven in the last 90 days but no speeding data at all. Check that the truck they drive is linked to Samsara.'
  from drivers d
  join driver_fuel_energy f on f.driver_id = d.id
  where d.is_active
    and f.distance_traveled_meters * 0.000621371 >= 1000
    and coalesce(d.samsara_driver_created_at, now() - interval '1 year') < now() - interval '14 days'
    and not exists (select 1 from driver_speeding_intervals s where s.driver_id = d.id and s.start_time > now() - interval '90 days')
    and not exists (select 1 from driver_light_speeding_daily l where l.driver_id = d.id and l.day > current_date - 90)
), all_issues as (
  select * from unlinked
  union all select * from stalled
  union all select * from unattributed
  union all select * from nodata
)
select severity, kind, subject, detail
from all_issues
where auth.role() = 'authenticated'
  and not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'planning_agent');

revoke all on samsara_coverage_issues from anon;
grant select on samsara_coverage_issues to authenticated;
