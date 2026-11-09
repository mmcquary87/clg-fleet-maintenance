-- Driver Safety Scorecard — zero speeding events is a clean score, not N/A
-- (UAT bug, 2026-11-09): "Seven drivers have Speeding - N/A ... Speeding
-- can't be measured, and is excluded from their Overall Score rather than
-- counted as a perfect 100 ... We do not assign vehicles to drivers in
-- Samsara." Expected: "Speeding is measured and included in drivers'
-- overall score."
--
-- Background: the speeding_score CASE originally guarded against a real,
-- confirmed bug (2026-10-28, see samsara-sync-driver-safety/index.ts's own
-- header) where a truck with no Samsara "Static Assigned Driver" set
-- silently lost all its speeding-interval attribution, letting a driver who
-- was actually speeding score a phantom perfect 100. The guard's heuristic:
-- if a driver has zero speeding events in driver_speeding_intervals BUT
-- shows other real activity (safety events, HOS points, or miles driven),
-- treat the zero as suspicious (unattributed data) rather than a clean
-- record, and show "N/A" instead of 100.
--
-- That heuristic can no longer tell the two cases apart, because the
-- attribution itself was already fixed the same day by switching to the
-- time-windowed /fleet/driver-vehicle-assignments join (not a static field)
-- -- and CLG doesn't use Samsara's static vehicle assignment at all, by
-- design ("We do not assign vehicles to drivers in Samsara"), so every
-- driver legitimately shows no static assignment. Driving activity (miles,
-- safety events) is proof the driver was out there and the real-time
-- assignment join is working; it is NOT evidence that speeding data went
-- unattributed. With the guard in place, any driver who simply never had a
-- moderate-or-worse speeding interval (the actual common case for a safe
-- driver, since "light" severity isn't stored at all) gets permanently
-- stuck at N/A and excluded from their own score and the fleet average --
-- not the "real N/A, not a fake 100" case, just a clean driving record
-- being mistaken for missing data.
--
-- Fix: speeding_score is now always computed directly from penalty points
-- (zero events -> the formula's own 100, same formula every other score
-- uses). Mosley still won't gain unearned points from this -- his overall
-- score is still fully suppressed by the separate 14-day grace-period
-- check below, unrelated to this one.
create or replace view driver_safety_scorecard as
with window_bounds as (
  select now() - interval '90 days' as window_start, now() as window_end
),
speeding_points as (
  select
    dsi.driver_id,
    sum(coalesce(inf.points, 0)) as penalty_points,
    count(*) as speeding_event_count
  from driver_speeding_intervals dsi
  cross join window_bounds wb
  left join accountability_infraction_patterns p on p.match_type = 'speeding_severity' and p.match_value = dsi.severity_level
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dsi.driver_id is not null
    and dsi.start_time between wb.window_start and wb.window_end
    and dsi.max_speed_kmh * 0.621371 <= 85
    and not dsi.is_dismissed
  group by dsi.driver_id
),
safety_points as (
  select
    dse.driver_id,
    sum(coalesce(inf.points, 0)) as safety_points,
    count(distinct dse.id) as safety_event_count
  from driver_safety_events dse
  cross join window_bounds wb
  cross join lateral jsonb_array_elements(dse.behavior_labels) as label_elem
  left join accountability_infraction_patterns p on p.match_type = 'safety_label' and (label_elem ->> 'name') ilike p.match_value
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dse.driver_id is not null
    and dse.event_time between wb.window_start and wb.window_end
    and coalesce(dse.coaching_state, '') <> 'Dismissed'
  group by dse.driver_id
),
hos_points as (
  select
    dhv.driver_id,
    sum(coalesce(inf.points, 0)) as hos_points
  from driver_hos_violations dhv
  cross join window_bounds wb
  left join accountability_infraction_patterns p on p.match_type = 'hos_description' and dhv.description ilike p.match_value
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dhv.driver_id is not null
    and dhv.violation_start_time between wb.window_start and wb.window_end
  group by dhv.driver_id
),
manual_hos_points as (
  select
    di.driver_id,
    sum(inf.points) as manual_hos_points
  from driver_incidents di
  join accountability_infractions inf on inf.id = di.infraction_id
  where inf.counts_toward_score
    and not exists (select 1 from accountability_infraction_patterns p where p.infraction_id = inf.id)
    and di.event_date >= current_date - make_interval(days => inf.rollover_days)
  group by di.driver_id
),
driver_miles as (
  select dfe.driver_id, dfe.distance_traveled_meters * 0.000621371 as miles_driven
  from driver_fuel_energy dfe
  where dfe.driver_id is not null
),
scored as (
  select
    d.id as driver_id,
    d.name as driver_name,
    d.samsara_driver_created_at,
    coalesce(dm.miles_driven, 0) as miles_driven,
    coalesce(sp.speeding_event_count, 0) as speeding_event_count,
    coalesce(sfp.safety_event_count, 0) as safety_event_count,
    least(100, 100 * exp(-coalesce(sp.penalty_points, 0) / 700.0)) as speeding_score,
    greatest(0, least(100, 100 - coalesce(sfp.safety_points, 0) * 5)) as safety_score,
    greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0)) * 4)) as hos_score
  from drivers d
  left join speeding_points sp on sp.driver_id = d.id
  left join safety_points sfp on sfp.driver_id = d.id
  left join hos_points hp on hp.driver_id = d.id
  left join manual_hos_points mhp on mhp.driver_id = d.id
  left join driver_miles dm on dm.driver_id = d.id
  where d.samsara_driver_id is not null
    and d.is_active
),
curved as (
  select *, (speeding_score + safety_score + hos_score) / 3.0 as raw_score
  from scored
),
with_overall as (
  select
    *,
    case
      when miles_driven <= 0 then null
      when samsara_driver_created_at is not null and samsara_driver_created_at > now() - interval '14 days' then null
      else least(100, 100 * power(raw_score / 100.0, 1.7))
    end as overall_score
  from curved
),
fleet_avg as (
  select avg(overall_score) as avg_score from with_overall where overall_score is not null
)
select
  w.driver_id,
  w.driver_name,
  w.speeding_score,
  w.safety_score,
  w.hos_score,
  w.raw_score,
  w.overall_score,
  w.miles_driven,
  w.speeding_event_count,
  w.safety_event_count,
  case when w.miles_driven > 0 then w.speeding_event_count / (w.miles_driven / 1000.0) else null end as speeding_events_per_1k_miles,
  case when w.miles_driven > 0 then w.safety_event_count / (w.miles_driven / 1000.0) else null end as safety_events_per_1k_miles,
  fa.avg_score as fleet_average_score,
  case when w.overall_score is not null then w.overall_score - fa.avg_score else null end as points_vs_average,
  case
    when w.overall_score is null then null
    when (w.overall_score - fa.avg_score) >= 3 then 'green'
    when (w.overall_score - fa.avg_score) <= -3 then 'red'
    else 'yellow'
  end as score_band
from with_overall w cross join fleet_avg fa;

-- Same fix applied to the parameterized range function (same body as
-- 20261109010000, which already fixed the grace-period window_end bug --
-- this just also drops the speeding_score null branch).
create or replace function driver_safety_scorecard_range(window_start timestamptz, window_end timestamptz)
returns table (
  driver_id text,
  driver_name text,
  speeding_score numeric,
  safety_score numeric,
  hos_score numeric,
  raw_score numeric,
  overall_score numeric,
  miles_driven numeric,
  speeding_event_count bigint,
  safety_event_count bigint,
  speeding_events_per_1k_miles numeric,
  safety_events_per_1k_miles numeric,
  fleet_average_score numeric,
  points_vs_average numeric,
  score_band text
)
language sql
stable
as $$
  with speeding_points as (
    select
      dsi.driver_id,
      sum(coalesce(inf.points, 0)) as penalty_points,
      count(*) as speeding_event_count
    from driver_speeding_intervals dsi
    left join accountability_infraction_patterns p on p.match_type = 'speeding_severity' and p.match_value = dsi.severity_level
    left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
    where dsi.driver_id is not null
      and dsi.start_time between window_start and window_end
      and dsi.max_speed_kmh * 0.621371 <= 85
      and not dsi.is_dismissed
    group by dsi.driver_id
  ),
  safety_points as (
    select
      dse.driver_id,
      sum(coalesce(inf.points, 0)) as safety_points,
      count(distinct dse.id) as safety_event_count
    from driver_safety_events dse
    cross join lateral jsonb_array_elements(dse.behavior_labels) as label_elem
    left join accountability_infraction_patterns p on p.match_type = 'safety_label' and (label_elem ->> 'name') ilike p.match_value
    left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
    where dse.driver_id is not null
      and dse.event_time between window_start and window_end
      and coalesce(dse.coaching_state, '') <> 'Dismissed'
    group by dse.driver_id
  ),
  hos_points as (
    select
      dhv.driver_id,
      sum(coalesce(inf.points, 0)) as hos_points
    from driver_hos_violations dhv
    left join accountability_infraction_patterns p on p.match_type = 'hos_description' and dhv.description ilike p.match_value
    left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
    where dhv.driver_id is not null
      and dhv.violation_start_time between window_start and window_end
    group by dhv.driver_id
  ),
  manual_hos_points as (
    select
      di.driver_id,
      sum(inf.points) as manual_hos_points
    from driver_incidents di
    join accountability_infractions inf on inf.id = di.infraction_id
    where inf.counts_toward_score
      and not exists (select 1 from accountability_infraction_patterns p where p.infraction_id = inf.id)
      and di.event_date >= window_start::date
      and di.event_date <= window_end::date
    group by di.driver_id
  ),
  driver_miles as (
    select dfe.driver_id, dfe.distance_traveled_meters * 0.000621371 as miles_driven
    from driver_fuel_energy dfe
    where dfe.driver_id is not null
  ),
  scored as (
    select
      d.id as driver_id,
      d.name as driver_name,
      d.samsara_driver_created_at,
      coalesce(dm.miles_driven, 0) as miles_driven,
      coalesce(sp.speeding_event_count, 0) as speeding_event_count,
      coalesce(sfp.safety_event_count, 0) as safety_event_count,
      least(100, 100 * exp(-coalesce(sp.penalty_points, 0) / 700.0)) as speeding_score,
      greatest(0, least(100, 100 - coalesce(sfp.safety_points, 0) * 5)) as safety_score,
      greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0)) * 4)) as hos_score
    from drivers d
    left join speeding_points sp on sp.driver_id = d.id
    left join safety_points sfp on sfp.driver_id = d.id
    left join hos_points hp on hp.driver_id = d.id
    left join manual_hos_points mhp on mhp.driver_id = d.id
    left join driver_miles dm on dm.driver_id = d.id
    where d.samsara_driver_id is not null
      and d.is_active
  ),
  curved as (
    select *, (speeding_score + safety_score + hos_score) / 3.0 as raw_score
    from scored
  ),
  with_overall as (
    select
      *,
      case
        when miles_driven <= 0 then null
        when samsara_driver_created_at is not null and samsara_driver_created_at > window_end - interval '14 days' then null
        else least(100, 100 * power(raw_score / 100.0, 1.7))
      end as overall_score
    from curved
  ),
  fleet_avg as (
    select avg(overall_score) as avg_score from with_overall where overall_score is not null
  )
  select
    w.driver_id,
    w.driver_name,
    w.speeding_score,
    w.safety_score,
    w.hos_score,
    w.raw_score,
    w.overall_score,
    w.miles_driven,
    w.speeding_event_count,
    w.safety_event_count,
    case when w.miles_driven > 0 then w.speeding_event_count / (w.miles_driven / 1000.0) else null end as speeding_events_per_1k_miles,
    case when w.miles_driven > 0 then w.safety_event_count / (w.miles_driven / 1000.0) else null end as safety_events_per_1k_miles,
    fa.avg_score as fleet_average_score,
    case when w.overall_score is not null then w.overall_score - fa.avg_score else null end as points_vs_average,
    case
      when w.overall_score is null then null
      when (w.overall_score - fa.avg_score) >= 3 then 'green'
      when (w.overall_score - fa.avg_score) <= -3 then 'red'
      else 'yellow'
    end as score_band
  from with_overall w cross join fleet_avg fa;
$$;

grant execute on function driver_safety_scorecard_range(timestamptz, timestamptz) to authenticated;
