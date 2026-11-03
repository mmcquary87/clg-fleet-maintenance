-- Driver Safety / Accountability — Missing Driver Certification data cleanup
-- + is_active scoring gap (CLG investigation, 2026-11-03)
--
-- Root cause (see samsara-sync-driver-safety/index.ts's own updated header):
-- Samsara's /fleet/hos/violations reports "unsubmittedLogs" (Missing Driver
-- Certification) based on whether a day's log is certified AS OF THE MOMENT
-- OF THE POLL, not a final settled fact. A driver who certifies normally at
-- end of shift still gets caught "not yet certified" by at least one of this
-- sync's 15-minute polls on nearly every working day. The sync only ever
-- upserted what Samsara returned and never re-checked/retracted a day once
-- written, so that transient, already-resolved state became a PERMANENT
-- scored violation for nearly the entire active fleet.
--
-- Confirmed against Samsara's own official HOS Violations export
-- (Oct 1-31, 2026) and its driver-level "Hours of Service Report" exports:
-- of 30 drivers showing a 22-42 day unbroken "Missing Driver Certification"
-- streak in our data, only 2 (Jason Sheffield, Michael Durbin) are real,
-- confirmed chronic non-certifiers. The other ~28 -- including Christopher
-- Urban, Brandon Williams, Dejuan Parker, Patricia Manning -- had zero or
-- near-zero real occurrences. Even drivers with SOME real occurrences
-- (e.g. Clancy Fowler: 3 real days) were being over-counted by 5-10x.
--
-- Given the scale, this purges every unsubmittedLogs row outright rather
-- than attempting to cherry-pick which historical rows might be real --
-- the sync fix's reconciliation step (HOS_VIOLATIONS_RECONCILE_DAYS) will
-- repopulate accurate data going forward, re-verifying a trailing 7-day
-- window on every run instead of only ever adding rows.
delete from driver_hos_violations where violation_type = 'unsubmittedLogs';

-- Unrelated housekeeping surfaced during this investigation: any HOS
-- violation row that never matched a real driver (office test accounts in
-- Samsara with no corresponding Alvys-sourced drivers row) never affected
-- any real score, but is pure clutter -- same reasoning applies to any
-- violation type, not just the one above.
delete from driver_hos_violations where driver_id is null;

-- Jason Sheffield resigned weeks ago (CLG direction, 2026-11-03) but it was
-- recorded in neither Alvys nor driver_roster, so nothing in CLGOS knew he
-- was gone -- he was still being scored and counted in the fleet average.
-- This is a stopgap in driver_roster (independent of whatever happens in
-- Alvys, which is the real source of drivers.is_active); the is_active
-- filtering added below is what actually keeps him out of the fleet
-- average and rankings once Alvys itself is updated.
insert into driver_roster (driver_name, eligibility, unavailable_reason, start_date, approval)
values ('Jason Sheffield', 'Not Eligible', 'Terminated', current_date, 'CLG direction, 2026-11-03 -- resigned weeks prior');

-- Structural gap: driver_safety_scorecard and its range twin never
-- filtered on drivers.is_active at all -- a resigned employee would still
-- count toward the fleet average and rankings. Fixed below. (NOT applied
-- to driver_accountability_status itself: driver_incident_detail inner-
-- joins it to show every logged incident, including a since-departed
-- driver's historical record, which must stay visible for HR/record-
-- keeping purposes. It doesn't need its own filter anyway -- its
-- fleet_average_score column just reads from driver_safety_scorecard, so
-- it already reflects the corrected active-only average.)
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
    case
      when coalesce(sp.speeding_event_count, 0) = 0
        and (coalesce(sfp.safety_event_count, 0) > 0 or coalesce(hp.hos_points, 0) > 0 or coalesce(dm.miles_driven, 0) > 0)
        then null
      else least(100, 100 * exp(-coalesce(sp.penalty_points, 0) / 700.0))
    end as speeding_score,
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
  select
    *,
    case when speeding_score is null then (safety_score + hos_score) / 2.0
      else (speeding_score + safety_score + hos_score) / 3.0
    end as raw_score
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
      case
        when coalesce(sp.speeding_event_count, 0) = 0
          and (coalesce(sfp.safety_event_count, 0) > 0 or coalesce(hp.hos_points, 0) > 0 or coalesce(dm.miles_driven, 0) > 0)
          then null
        else least(100, 100 * exp(-coalesce(sp.penalty_points, 0) / 700.0))
      end as speeding_score,
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
    select *,
      case when speeding_score is null then (safety_score + hos_score) / 2.0
        else (speeding_score + safety_score + hos_score) / 3.0
      end as raw_score
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
$$;

grant execute on function driver_safety_scorecard_range(timestamptz, timestamptz) to authenticated;
