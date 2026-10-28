-- Driver Safety Scorecard — PC Misuse / Yard Move Misuse can't come from
-- Samsara, plus a dismissed-speeding-event gap
--
-- Per the official "Driver Safety Infraction & Accountability Program"
-- (FINAL, 2026-10-28): PC Misuse is tracked manually (a dedicated Teams
-- channel + Safety random audits). Yard Move Misuse is currently judged by
-- Safety off a Power BI "Yard Move HOS Logs" report (raw Start/End Time per
-- Yard-Move duty-status segment, pulled via Samsara.Records' Yard Move
-- Report) -- the misuse call itself is still a human judgment entered as a
-- labeled event, not a live computed flag; an automated speed+duration
-- detector (>15 mph sustained >=20 min) is explicitly a later phase, not
-- built yet anywhere. Neither category is a violation type Samsara's HOS
-- Violations API or Safety Events behavior-label vocabulary exposes.
--
-- driver_safety_scorecard's safety_points CTE had ILIKE branches for
-- 'yard move%' and 'personal conveyance%'/'pc misuse%' against Samsara
-- behavior labels anyway (20261007040000's own header admitted these were
-- unverified guesses at Samsara's label vocabulary). Since no Samsara feed
-- ever produces those labels, those branches never match anything in
-- practice -- a driver with a manually-logged PC Misuse or Yard Move Misuse
-- incident (driver_incidents, which already has both infraction rows from
-- 20261007060000) currently gets zero points toward their actual Driver
-- Score, even though Safety logged the event.
--
-- Fix: drop the dead Samsara-label branches, and instead fold active
-- (within-rollover-window, confirmed 60 days per CLG direction 2026-10-28)
-- manually-logged incidents for these two families into the HOS bucket --
-- matching the official doc, which lists both under HOS Violations (PC
-- Misuse 0.75, Yard Move Misuse 1.0), not Safety Events.
--
-- Also: driver_safety_events already excludes coaching_state = 'Dismissed'
-- from the Safety score, but driver_speeding_intervals.is_dismissed (synced
-- straight from Samsara's isDismissed) was never checked in speeding_points
-- -- a dismissed speeding interval still counted toward the Speeding score.
-- Added the same dismissed-exclusion there for consistency.
--
-- This touches BOTH driver_safety_scorecard (the live trailing-90-day view)
-- and driver_safety_scorecard_range (20261015010000's parameterized twin for
-- the Rankings date-range tool, deliberately kept as "the exact same
-- formula") so the two don't drift apart again. Both already carry
-- 20261014030000's exclusion of Missing Driver Certification/Shipping
-- ID/Trailer Name from the HOS score -- preserved as-is here, not reverted.
--
-- Also corrects two stale point values in accountability_infractions (the
-- manual Log Incident table) against the official doc's tables: PC Misuse
-- 1 -> 0.75, Missing Driver Certification 0.5 -> 1.0 (the Samsara scorecard
-- view already had the latter right -- this just brings the manual-entry
-- table in line with it).

update accountability_infractions set points = 0.75 where name = 'PC Misuse';
update accountability_infractions set points = 1.0 where name = 'Missing Driver Certification';

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
    and not dsi.is_dismissed
  group by dsi.driver_id
),
-- Yard Move / Personal Conveyance misuse removed from here -- see migration
-- header. Neither is a Samsara safety-event behavior label; both are scored
-- below from manually-logged driver_incidents instead.
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
      -- Trailer Name intentionally excluded -- see 20261014030000.
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
-- Manually-logged PC Misuse / Yard Move Misuse (Log Incident ->
-- driver_incidents), scored per-infraction's own rollover_days rather than
-- the Samsara telemetry's fixed 90-day window -- this is the accountability
-- program's point-decay window (60 days), a different concept from the
-- trailing-90-days telemetry pull above.
manual_hos_points as (
  select
    di.driver_id,
    sum(inf.points) as manual_hos_points
  from driver_incidents di
  join accountability_infractions inf on inf.id = di.infraction_id
  where inf.violation_family in ('Personal Conveyance', 'Yard Move')
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

-- Same three fixes (dismissed speeding, dead yard-move/PC-misuse branches,
-- manual PC Misuse/Yard Move via driver_incidents) applied to the
-- parameterized twin so it stays "the exact same formula" as the view, per
-- its own header's stated intent.
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
      sum(case
        when dsi.severity_level = 'moderate' then 0.25
        when dsi.severity_level = 'heavy' then 0.75
        when dsi.severity_level = 'severe' then 1.75
        else 0
      end) as penalty_points,
      count(*) as speeding_event_count
    from driver_speeding_intervals dsi
    where dsi.driver_id is not null
      and dsi.start_time between window_start and window_end
      and dsi.max_speed_kmh * 0.621371 <= 85
      and not dsi.is_dismissed
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
        else 0
      end) as safety_points,
      count(distinct dse.id) as safety_event_count
    from driver_safety_events dse,
      lateral jsonb_array_elements(dse.behavior_labels) as label_elem
    where dse.driver_id is not null
      and dse.event_time between window_start and window_end
      and coalesce(dse.coaching_state, '') <> 'Dismissed'
    group by dse.driver_id
  ),
  hos_points as (
    select
      dhv.driver_id,
      sum(case
        -- Missing Driver Certification / Missing Shipping ID / Missing
        -- Trailer Name excluded, same as the main view (20261014030000).
        when dhv.description ilike 'missed rest break%' then 0.75
        when dhv.description ilike 'shift driving limit%' then 2.75
        when dhv.description ilike 'cycle limit%' then 2.75
        when dhv.description ilike 'shift duty limit%' then 2.75
        else 0
      end) as hos_points
    from driver_hos_violations dhv
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
    where inf.violation_family in ('Personal Conveyance', 'Yard Move')
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
$$;
