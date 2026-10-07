-- Fleet Maintenance System — Driver Safety Scorecard scoring ("Magic Math")
--
-- Ports the exact scoring formula decoded from CLG's Power BI Driver
-- Safety Scorecard (via pbixray against the uploaded .pbix's DAX
-- measures) onto the data samsara-sync-driver-safety accumulates every 15
-- minutes. Approved as-is, including the 14-day grace period and the
-- ^1.7 curve.
--
-- Window: trailing 90 days. The sync only ever pulls a short rolling
-- window per run (see samsara-sync-driver-safety's header for why a
-- bigger single pull isn't viable), so these numbers are thin until
-- ~90 days of history has accumulated — that's expected, not a bug.
--
-- Formula:
--   Speeding Score = 100 * EXP(-PenaltyPoints / 700)
--     PenaltyPoints = sum over speeding intervals with max speed <= 85mph:
--       moderate 0.25, heavy 0.75, severe 1.75 ("light" is never stored —
--       see the sync function — so it never reaches this sum anyway)
--   Safety Score = 100 - (SafetyPoints * 5), clamped [0, 100]
--     SafetyPoints = sum over safety events, excluding coaching_state =
--       'Dismissed', one weight per behavior label on the event:
--       Harsh Brake 0.75, Rolling Stop 0.75, Following Distance 1.50,
--       Forward Collision Warning 1.75, Harsh Turn 1.0, Crash 2.00,
--       Roadside Parking 0.75, Ran Red Light 2.0, Yard Move 0.75,
--       Personal Conveyance misuse 1.0, else 0
--   HOS Score = 100 - (HOSPoints * 4), clamped [0, 100]
--     HOSPoints = sum over HOS violations:
--       Missing Driver Certification 1, Missing Shipping ID 0.25,
--       Missing Trailer Name 0.25, Missed Rest Break 0.75,
--       Shift Driving Limit (USA-11 Hours) 2.75, Cycle Limit 2.75,
--       Shift Duty Limit 2.75, else 0
--   Overall score (the Scorecard page's headline number):
--     Raw = (Speeding + Safety + HOS) / 3
--     Curved = 100 * (Raw / 100) ^ 1.7
--     Result = LEAST(100, Curved)
--     -- blank (null) if the driver's distance traveled in the window = 0
--     -- blank (null) if the driver was added to Samsara within 14 days
--   Points vs fleet average, and a green/yellow/red color banding at the
--   +-3 point threshold (one of two thresholds seen in the PBIX's color
--   measures — the other used +-1; +-3 chosen as the one actually wired
--   to the live Scorecard page's "Points vs Average" visual).
--
-- Behavior-label and HOS-description matching uses ILIKE against Samsara's
-- display names. Only "Following Distance" and "Harsh Brake" were
-- confirmed against real sample data during this build; the rest follow
-- Samsara's documented standard behavior-label vocabulary and may need a
-- pattern tweak once more label strings are observed in production.

create view driver_safety_scorecard as
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
      when dhv.description ilike 'missing driver certification%' then 1
      when dhv.description ilike 'missing shipping id%' then 0.25
      when dhv.description ilike 'missing trailer name%' then 0.25
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
