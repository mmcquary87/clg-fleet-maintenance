-- Fleet Maintenance System — fix: dismissed safety events were still scored
--
-- driver_safety_scorecard and driver_safety_scorecard_range excluded dismissed
-- safety events with `coalesce(coaching_state,'') <> 'Dismissed'`, but Samsara
-- returns the state lowercase ('dismissed'). The comparison is case-sensitive,
-- so NO dismissed event was ever excluded: 29 dismissed events (15 active
-- drivers in the 90-day window) were counting against safety scores. This is
-- UAT "Safety inbox events that were dismissed but are on drivers' scorecards"
-- (Aguilar, Suggs, L Williams, Graham, Padilla, Schuler) and the Questions-tab
-- item about the Oct 5 event dismissed on Nov 2. Dismissal date does not matter:
-- the state is current as of the last sync (see samsara-sync-driver-safety's
-- safety-events reconcile window).
--
-- Body below is 20261110040000_missing_dvir_scoring.sql unchanged except the
-- comparison is now case-insensitive.

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
  left join accountability_infraction_patterns p on p.match_type = 'speeding_severity'
    and p.match_value = (
      case
        when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 15 then 'severe'
        when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 10 then 'heavy'
        when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 6 then 'moderate'
        when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 1 then 'light'
        else null
      end
    )
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dsi.driver_id is not null
    and dsi.start_time >= wb.window_start and dsi.start_time <= wb.window_end
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
    and dse.event_time >= wb.window_start and dse.event_time <= wb.window_end
    and lower(coalesce(dse.coaching_state, '')) <> 'dismissed'
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
    and dhv.violation_start_time >= wb.window_start and dhv.violation_start_time <= wb.window_end
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
    and di.event_date >= (current_date - make_interval(days => inf.rollover_days))
  group by di.driver_id
),
missing_dvir_points as (
  select
    md.driver_id,
    count(*) * max(inf.points) as missing_dvir_points
  from missing_dvirs md
  cross join window_bounds wb
  join accountability_infractions inf on inf.name = 'Missing DVIR' and inf.counts_toward_score
  where md.driver_id is not null
    and md.trip_start_time >= wb.window_start and md.trip_start_time <= wb.window_end
  group by md.driver_id
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
    greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0) + coalesce(mdp.missing_dvir_points, 0)) * 4)) as hos_score
  from drivers d
  left join speeding_points sp on sp.driver_id = d.id
  left join safety_points sfp on sfp.driver_id = d.id
  left join hos_points hp on hp.driver_id = d.id
  left join manual_hos_points mhp on mhp.driver_id = d.id
  left join missing_dvir_points mdp on mdp.driver_id = d.id
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

create or replace function driver_safety_scorecard_range(window_start timestamptz, window_end timestamptz)
returns table(
  driver_id text, driver_name text, speeding_score numeric, safety_score numeric, hos_score numeric,
  raw_score numeric, overall_score numeric, miles_driven numeric, speeding_event_count bigint,
  safety_event_count bigint, speeding_events_per_1k_miles numeric, safety_events_per_1k_miles numeric,
  fleet_average_score numeric, points_vs_average numeric, score_band text
)
language sql stable as $function$
  with speeding_points as (
    select
      dsi.driver_id,
      sum(coalesce(inf.points, 0)) as penalty_points,
      count(*) as speeding_event_count
    from driver_speeding_intervals dsi
    left join accountability_infraction_patterns p on p.match_type = 'speeding_severity'
      and p.match_value = (
        case
          when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 15 then 'severe'
          when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 10 then 'heavy'
          when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 6 then 'moderate'
          when (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 1 then 'light'
          else null
        end
      )
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
      and lower(coalesce(dse.coaching_state, '')) <> 'dismissed'
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
  missing_dvir_points as (
    select
      md.driver_id,
      count(*) * max(inf.points) as missing_dvir_points
    from missing_dvirs md
    join accountability_infractions inf on inf.name = 'Missing DVIR' and inf.counts_toward_score
    where md.driver_id is not null
      and md.trip_start_time between window_start and window_end
    group by md.driver_id
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
      greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0) + coalesce(mdp.missing_dvir_points, 0)) * 4)) as hos_score
    from drivers d
    left join speeding_points sp on sp.driver_id = d.id
    left join safety_points sfp on sfp.driver_id = d.id
    left join hos_points hp on hp.driver_id = d.id
    left join manual_hos_points mhp on mhp.driver_id = d.id
    left join missing_dvir_points mdp on mdp.driver_id = d.id
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
$function$;
