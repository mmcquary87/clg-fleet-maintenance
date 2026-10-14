-- Fleet Maintenance System — Driver Safety Scorecard: stop zeroing HOS on
-- paperwork/admin violations
--
-- Real-data spot check (2026-10-14, via the new driver point breakdown
-- panel) found "Missing Driver Certification" alone wiping HOS to 0 for
-- three very different drivers in the same 90-day window: the fleet's
-- worst driver (472 occurrences, deservedly low elsewhere too), its best
-- driver by every other measure (684 occurrences despite a perfect
-- Speeding score and a 96.3 Safety score), and a brand-new hire with zero
-- other violations of any kind (432 occurrences in ~5-6 weeks of real
-- tenure). A metric that saturates a near-perfect driver, a genuinely bad
-- one, and a brand-new hire identically isn't discriminating between good
-- and bad driving at all -- it's a log-certification paperwork backlog,
-- not a safety signal, and at weight 1 (only 25 needed to zero the whole
-- HOS axis via 100 - points*4) a few hundred of these overwhelms every
-- other HOS violation a driver could have.
--
-- Fix: drop the three administrative/paperwork violation types (Missing
-- Driver Certification, Missing Shipping ID, Missing Trailer Name) from
-- the HOS score entirely -- they still land in driver_hos_violations and
-- the point-breakdown panel's "unweighted" bucket, just no longer cost
-- points. The real driving-hours violations (Missed Rest Break, Shift
-- Driving Limit, Cycle Limit, Shift Duty Limit) are unchanged.
create or replace view driver_safety_scorecard as
with window_bounds as (
  select now() - interval '90 days' as window_start, now() as window_end
),
speeding_points as (
  select
    dsi.driver_id,
    sum(case
      when dsi.severity_level = 'moderate' then 0.25
      when dsi.severity_level = 'heavy' then 0.75
      when dsi.severity_level = 'severe' then 1.75
      else 0
    end) as penalty_points,
    count(*) as speeding_event_count
  from driver_speeding_intervals dsi, window_bounds wb
  where dsi.driver_id is not null
    and dsi.start_time between wb.window_start and wb.window_end
    and dsi.max_speed_kmh * 0.621371 <= 85
  group by dsi.driver_id
),
safety_points as (
  select
    dse.driver_id,
    sum(case
      when label_elem ->> 'name' ilike 'harsh brake%' or label_elem ->> 'name' ilike 'braking%' then 0.75
      when label_elem ->> 'name' ilike 'rolling stop%' then 0.75
      when label_elem ->> 'name' ilike 'following distance%' then 1.50
      when label_elem ->> 'name' ilike 'forward collision%' then 1.75
      when label_elem ->> 'name' ilike 'harsh turn%' then 1.0
      when label_elem ->> 'name' ilike 'crash%' then 2.00
      when label_elem ->> 'name' ilike 'roadside parking%' then 0.75
      when label_elem ->> 'name' ilike 'ran red light%' or label_elem ->> 'name' ilike 'red light%' then 2.0
      when label_elem ->> 'name' ilike 'yard move%' then 0.75
      when label_elem ->> 'name' ilike 'personal conveyance%' or label_elem ->> 'name' ilike 'pc misuse%' then 1.0
      else 0
    end) as safety_points,
    count(distinct dse.id) as safety_event_count
  from driver_safety_events dse, window_bounds wb,
    lateral jsonb_array_elements(dse.behavior_labels) as label_elem
  where dse.driver_id is not null
    and dse.event_time between wb.window_start and wb.window_end
    and coalesce(dse.coaching_state, '') <> 'Dismissed'
  group by dse.driver_id
),
hos_points as (
  select
    dhv.driver_id,
    sum(case
      -- Missing Driver Certification / Missing Shipping ID / Missing
      -- Trailer Name intentionally excluded -- see migration header.
      when dhv.description ilike 'missed rest break%' then 0.75
      when dhv.description ilike 'shift driving limit%' then 2.75
      when dhv.description ilike 'cycle limit%' then 2.75
      when dhv.description ilike 'shift duty limit%' then 2.75
      else 0
    end) as hos_points
  from driver_hos_violations dhv, window_bounds wb
  where dhv.driver_id is not null
    and dhv.violation_start_time between wb.window_start and wb.window_end
  group by dhv.driver_id
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
    greatest(0, least(100, 100 - coalesce(hp.hos_points, 0) * 4)) as hos_score
  from drivers d
  left join speeding_points sp on sp.driver_id = d.id
  left join safety_points sfp on sfp.driver_id = d.id
  left join hos_points hp on hp.driver_id = d.id
  left join driver_miles dm on dm.driver_id = d.id
  where d.samsara_driver_id is not null
),
curved as (
  select
    *,
    (speeding_score + safety_score + hos_score) / 3.0 as raw_score
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
