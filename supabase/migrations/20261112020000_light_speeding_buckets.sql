-- Fleet Maintenance System — light speeding as 1/2/3 points off the TOTAL score (buckets)
--
-- Replaces the continuous light-speeding penalty (20261111110000 + 20261112010000,
-- which fed the speeding component) with simple buckets, per direction
-- (2026-11-12): a driver's light-speeding volume, measured as light events per
-- 1,000 miles, falls in a low / middle / high bucket worth 1 / 2 / 3 points off
-- the OVERALL score (after the 1.7 curve, floored at 0).
--   rate < light_bucket_low_per_1k            -> light_points_low  (1)
--   low <= rate <= light_bucket_high_per_1k   -> light_points_mid  (2)
--   rate > light_bucket_high_per_1k           -> light_points_high (3)
-- Cutoffs are FIXED numbers (125 / 375 events per 1,000 miles: half and one-and-a-
-- half times the 60-day fleet average of ~250), reviewed quarterly, not recomputed
-- from the fleet -- a rolling average would punish drivers as the fleet improves.
-- Rate = events per 1,000 miles, so long-haul drivers are not penalised for
-- mileage (events vs miles correlate 0.48; rate vs miles 0.11). Drivers under
-- light_min_miles (3,000, 90-day snapshot) or with no light data score 0 points
-- (no data is not the same as clean driving). The points are flat across windows:
-- the range function classifies the window's RATE (miles prorated by days / 90).
-- The speeding component no longer includes any light term.
--
-- BACK OUT: re-run 20261111110000_episode_speeding_and_light_scoring.sql, then
-- update scoring_parameters set value = 0 where name = 'light_allowance_min_per_1k_miles'.

insert into scoring_parameters (name, value, description) values
  ('light_bucket_low_per_1k', 125, 'Light events per 1,000 miles below this = low bucket'),
  ('light_bucket_high_per_1k', 375, 'Light events per 1,000 miles above this = high bucket (between = middle)'),
  ('light_points_low', 1, 'Points off the overall score, low light-speeding bucket'),
  ('light_points_mid', 2, 'Points off the overall score, middle light-speeding bucket'),
  ('light_points_high', 3, 'Points off the overall score, high light-speeding bucket')
on conflict (name) do update set value = excluded.value, description = excluded.description;

update scoring_parameters set description = description || ' [no longer used: light speeding is scored in buckets]'
where name in ('light_allowance_min_per_1k_miles', 'light_cap_points', 'light_k_min_per_1k_miles')
  and description not like '%no longer used%';

create or replace view driver_safety_scorecard as
with window_bounds as (
  select now() - interval '90 days' as window_start, now() as window_end
),
params as (
  select
    max(value) filter (where name = 'speeding_episode_gap_minutes') as gap_min,
    max(value) filter (where name = 'speeding_episode_duration_step_minutes') as dur_step_min,
    max(value) filter (where name = 'speeding_episode_duration_max_extra') as dur_max_extra,
    max(value) filter (where name = 'light_min_miles') as light_min_miles,
    max(value) filter (where name = 'light_bucket_low_per_1k') as light_low,
    max(value) filter (where name = 'light_bucket_high_per_1k') as light_high,
    max(value) filter (where name = 'light_points_low') as light_pts_low,
    max(value) filter (where name = 'light_points_mid') as light_pts_mid,
    max(value) filter (where name = 'light_points_high') as light_pts_high
  from scoring_parameters
),
speeding_events as (
  select
    dsi.driver_id, dsi.id, dsi.start_time,
    coalesce(dsi.end_time, dsi.start_time) as end_time,
    greatest(0, extract(epoch from (coalesce(dsi.end_time, dsi.start_time) - dsi.start_time))) as dur_s,
    coalesce(inf.points, 0) as w
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
    and (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 6
),
speeding_flagged as (
  select e.*,
    case
      when max(e.end_time) over w is null then 1
      when e.start_time - max(e.end_time) over w > make_interval(secs => (select gap_min from params) * 60) then 1
      else 0
    end as new_ep
  from speeding_events e
  window w as (partition by e.driver_id order by e.start_time, e.id rows between unbounded preceding and 1 preceding)
),
speeding_episodes as (
  select driver_id, ep, max(w) as w, sum(dur_s) / 60.0 as over_min
  from (select f.*, sum(f.new_ep) over (partition by f.driver_id order by f.start_time, f.id) as ep from speeding_flagged f) n
  group by driver_id, ep
),
speeding_points as (
  select
    se.driver_id,
    sum(se.w * (1 + least(pr.dur_max_extra, se.over_min / pr.dur_step_min))) as penalty_points,
    count(*) as speeding_event_count
  from speeding_episodes se cross join params pr
  group by se.driver_id
),
light_points as (
  select l.driver_id, sum(l.event_count) as light_events
  from driver_light_speeding_daily l
  cross join window_bounds wb
  where l.driver_id is not null
    and l.day >= wb.window_start::date and l.day <= wb.window_end::date
  group by l.driver_id
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
    greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0) + coalesce(mdp.missing_dvir_points, 0)) * 4)) as hos_score,
    case
      when dm.miles_driven >= pr.light_min_miles and coalesce(lp.light_events, 0) > 0 then
        case
          when lp.light_events / (dm.miles_driven / 1000.0) < pr.light_low then pr.light_pts_low
          when lp.light_events / (dm.miles_driven / 1000.0) <= pr.light_high then pr.light_pts_mid
          else pr.light_pts_high
        end
      else 0
    end as light_deduction
  from drivers d
  cross join params pr
  left join speeding_points sp on sp.driver_id = d.id
  left join light_points lp on lp.driver_id = d.id
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
      else greatest(0, least(100, 100 * power(raw_score / 100.0, 1.7) - light_deduction))
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
  with params as (
    select
      max(value) filter (where name = 'speeding_episode_gap_minutes') as gap_min,
      max(value) filter (where name = 'speeding_episode_duration_step_minutes') as dur_step_min,
      max(value) filter (where name = 'speeding_episode_duration_max_extra') as dur_max_extra,
      max(value) filter (where name = 'light_min_miles') as light_min_miles,
      max(value) filter (where name = 'light_bucket_low_per_1k') as light_low,
      max(value) filter (where name = 'light_bucket_high_per_1k') as light_high,
      max(value) filter (where name = 'light_points_low') as light_pts_low,
      max(value) filter (where name = 'light_points_mid') as light_pts_mid,
      max(value) filter (where name = 'light_points_high') as light_pts_high
    from scoring_parameters
  ),
  speeding_events as (
    select
      dsi.driver_id, dsi.id, dsi.start_time,
      coalesce(dsi.end_time, dsi.start_time) as end_time,
      greatest(0, extract(epoch from (coalesce(dsi.end_time, dsi.start_time) - dsi.start_time))) as dur_s,
      coalesce(inf.points, 0) as w
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
      and (dsi.max_speed_kmh - dsi.posted_speed_limit_kmh) * 0.621371 >= 6
  ),
  speeding_flagged as (
    select e.*,
      case
        when max(e.end_time) over w is null then 1
        when e.start_time - max(e.end_time) over w > make_interval(secs => (select gap_min from params) * 60) then 1
        else 0
      end as new_ep
    from speeding_events e
    window w as (partition by e.driver_id order by e.start_time, e.id rows between unbounded preceding and 1 preceding)
  ),
  speeding_episodes as (
    select driver_id, ep, max(w) as w, sum(dur_s) / 60.0 as over_min
    from (select f.*, sum(f.new_ep) over (partition by f.driver_id order by f.start_time, f.id) as ep from speeding_flagged f) n
    group by driver_id, ep
  ),
  speeding_points as (
    select
      se.driver_id,
      sum(se.w * (1 + least(pr.dur_max_extra, se.over_min / pr.dur_step_min))) as penalty_points,
      count(*) as speeding_event_count
    from speeding_episodes se cross join params pr
    group by se.driver_id
  ),
  win as (
    select greatest(extract(epoch from (window_end - window_start)) / 86400.0, 1.0) as days
  ),
  light_points as (
    select l.driver_id, sum(l.event_count) as light_events
    from driver_light_speeding_daily l
    where l.driver_id is not null
      and l.day >= window_start::date and l.day <= window_end::date
    group by l.driver_id
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
      greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0) + coalesce(mdp.missing_dvir_points, 0)) * 4)) as hos_score,
      case
        when dm.miles_driven >= pr.light_min_miles and coalesce(lp.light_events, 0) > 0 then
          case
            when lp.light_events / ((dm.miles_driven * wn.days / 90.0) / 1000.0) < pr.light_low then pr.light_pts_low
            when lp.light_events / ((dm.miles_driven * wn.days / 90.0) / 1000.0) <= pr.light_high then pr.light_pts_mid
            else pr.light_pts_high
          end
        else 0
      end as light_deduction
    from drivers d
    cross join params pr
    cross join win wn
    left join speeding_points sp on sp.driver_id = d.id
    left join light_points lp on lp.driver_id = d.id
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
        else greatest(0, least(100, 100 * power(raw_score / 100.0, 1.7) - light_deduction))
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
