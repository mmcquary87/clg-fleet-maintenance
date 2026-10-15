-- Fleet Maintenance System — Driver Safety Scorecard, arbitrary date range
--
-- driver_safety_scorecard (the view) stays exactly as-is -- it's the
-- official trailing-90-day scoring window that Accountability's fine
-- eligibility and the daily fleet_score_snapshots are keyed to, and
-- nothing here changes its behavior.
--
-- This adds a second, parameterized way to run the exact same formula
-- (post 20261014030000's admin-violation exclusion) over any caller-given
-- window, for the Rankings tab's new date-range tool -- same CTEs as the
-- view, just with window_start/window_end as arguments instead of
-- `now() - interval '90 days'`.
--
-- Caveat (documented in the UI too): miles_driven/events-per-1k-miles come
-- from driver_fuel_energy, which is only ever a trailing-90-days-as-of-
-- last-sync snapshot (see samsara-sync-driver-safety's header) -- there's
-- no historical daily mileage table to re-slice per arbitrary range. Event
-- counts/points ARE exact for whatever window is passed; the mileage
-- figure is not range-specific.
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

grant execute on function driver_safety_scorecard_range(timestamptz, timestamptz) to authenticated;
