-- Fleet Maintenance System — speeding scored per EPISODE (duration-weighted) + light speeding by rate
--
-- Direction (2026-11-11): keep the 6 mph Moderate threshold and the tier weights,
-- but stop counting fragments of one stretch as separate violations, and score
-- light speeding (1 to <6 mph over, tallied per day in driver_light_speeding_daily)
-- by rate instead of per event.
--
-- 1. Speeding intervals at >= 6 mph over are merged into EPISODES: consecutive
--    intervals for the same driver whose gap is <= speeding_episode_gap_minutes
--    (5) are one episode. Each episode scores the weight of the highest tier it
--    reached (same infraction-table weights as before, so Settings edits still
--    work), multiplied by 1 + min(speeding_episode_duration_max_extra (2),
--    minutes_over_limit / speeding_episode_duration_step_minutes (5)) -- i.e.
--    1x for a blip up to 3x for 10+ minutes over the limit. 90 days measured:
--    31,818 intervals -> ~7,900 episodes; median episode 0.75 min over the limit.
--    speeding_event_count is now the number of episodes.
-- 2. Light speeding adds to the speeding penalty points:
--      rate = light minutes / (miles / 1000)
--      light_points = light_cap_points * (1 - exp(-max(0, rate - light_allowance) / light_k))
--    (Option B: first 100 min per 1,000 miles free, ceiling 150 points), only for
--    drivers with >= light_min_miles (3,000) miles. The range function scales
--    miles and the penalty to the window length (days / 90) so short ranges stay
--    comparable with the 90-day official view.
-- All numbers live in scoring_parameters (editable with SQL, no redeploy).
--
-- BACK OUT: re-run 20261111090000_fix_dismissed_safety_events_case.sql (restores
-- the previous per-event scoring exactly). scoring_parameters can be left in place.
-- A labelled before-snapshot is in scorecard_snapshots
-- ('pre_episode_light_scoring_20261111').

create table if not exists scoring_parameters (
  name text primary key,
  value numeric not null,
  description text
);
alter table scoring_parameters enable row level security;
create policy "scoring_parameters_select_all" on scoring_parameters for select using (auth.role() = 'authenticated');
create policy planning_agent_deny on scoring_parameters as restrictive for all to authenticated
  using (not is_planning_agent()) with check (not is_planning_agent());

insert into scoring_parameters (name, value, description) values
  ('speeding_episode_gap_minutes', 5, 'Speeding intervals (>= 6 mph over) for one driver closer together than this are one episode'),
  ('speeding_episode_duration_step_minutes', 5, 'Minutes over the limit per +1x of episode weight'),
  ('speeding_episode_duration_max_extra', 2, 'Maximum extra multiplier from duration (episode weight is 1x to 1+this)'),
  ('light_min_miles', 3000, 'Light speeding is only scored for drivers with at least this many miles in the 90-day snapshot'),
  ('light_allowance_min_per_1k_miles', 100, 'Light-speeding minutes per 1,000 miles that cost nothing'),
  ('light_cap_points', 150, 'Ceiling for the light-speeding penalty, in speeding penalty points'),
  ('light_k_min_per_1k_miles', 150, 'How quickly the light penalty approaches its ceiling (minutes per 1,000 miles)')
on conflict (name) do update set value = excluded.value, description = excluded.description;

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
    max(value) filter (where name = 'light_allowance_min_per_1k_miles') as light_allowance,
    max(value) filter (where name = 'light_cap_points') as light_cap,
    max(value) filter (where name = 'light_k_min_per_1k_miles') as light_k
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
  select l.driver_id, sum(l.total_seconds) / 60.0 as light_minutes
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
    least(100, 100 * exp(-(coalesce(sp.penalty_points, 0) + coalesce(
      case when dm.miles_driven >= pr.light_min_miles then
        pr.light_cap * (1 - exp(-greatest(0, coalesce(lp.light_minutes, 0) / (dm.miles_driven / 1000.0) - pr.light_allowance) / pr.light_k))
      end, 0)) / 700.0)) as speeding_score,
    greatest(0, least(100, 100 - coalesce(sfp.safety_points, 0) * 5)) as safety_score,
    greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0) + coalesce(mdp.missing_dvir_points, 0)) * 4)) as hos_score
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
  with params as (
    select
      max(value) filter (where name = 'speeding_episode_gap_minutes') as gap_min,
      max(value) filter (where name = 'speeding_episode_duration_step_minutes') as dur_step_min,
      max(value) filter (where name = 'speeding_episode_duration_max_extra') as dur_max_extra,
      max(value) filter (where name = 'light_min_miles') as light_min_miles,
      max(value) filter (where name = 'light_allowance_min_per_1k_miles') as light_allowance,
      max(value) filter (where name = 'light_cap_points') as light_cap,
      max(value) filter (where name = 'light_k_min_per_1k_miles') as light_k
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
    select l.driver_id, sum(l.total_seconds) / 60.0 as light_minutes
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
      least(100, 100 * exp(-(coalesce(sp.penalty_points, 0) + coalesce(
        case when dm.miles_driven >= pr.light_min_miles then
          pr.light_cap * (1 - exp(-greatest(0, coalesce(lp.light_minutes, 0) / ((dm.miles_driven * wn.days / 90.0) / 1000.0) - pr.light_allowance) / pr.light_k)) * wn.days / 90.0
        end, 0)) / 700.0)) as speeding_score,
      greatest(0, least(100, 100 - coalesce(sfp.safety_points, 0) * 5)) as safety_score,
      greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0) + coalesce(mdp.missing_dvir_points, 0)) * 4)) as hos_score
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
