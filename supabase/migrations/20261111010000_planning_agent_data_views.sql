-- Fleet Maintenance System — freight-planning agent team: read surface
--
-- Four narrow, explicitly-column-scoped views an externally-run
-- freight-planning agent team reads from — not raw table grants, so a
-- future column added to e.g. alvys_loads for an unrelated reason
-- doesn't silently start leaking to an external consumer. Each view
-- bakes its own access gate directly into the WHERE clause (same
-- exists-against-profiles shape every RLS policy in this repo already
-- uses, e.g. 20260906010000_driver_compliance_rls.sql) rather than
-- relying on Postgres view-ownership/security_invoker semantics, so the
-- restriction is visible by just reading the view definition and isn't
-- sensitive to who happens to own the view object.
--
-- Gated to 'planning_agent' (the external team's service account,
-- 20261111000000) and 'admin' (so a human can debug what the agent team
-- sees without a second account). Deliberately NOT opened to
-- dispatcher/operations/etc. here — those roles already see this data
-- through the app's existing pages; this is a separate, auditable read
-- path reserved for the external integration.
--
-- hos-compliance-auditor and equipment-coordinator read
-- planning_driver_compliance_v / planning_equipment_v as-is rather than
-- re-deriving HOS/DVIR compliance from Samsara directly — see
-- samsara-sync-missing-dvirs and driver_safety_scorecard for why that
-- logic shouldn't be duplicated (calibrated shift-start/rest-threshold
-- detection, not a naive check).

create or replace view planning_equipment_v as
select
  u.id as unit_id,
  u.number,
  u.type,
  u.is_active,
  u.can_move_load,
  u.domicile,
  u.odometer,
  u.current_lat,
  u.current_lng,
  u.current_location,
  u.ownership,
  u.year,
  u.make,
  u.model,
  u.fuel_type,
  u.hourly_revenue_rate,
  u.pm_interval_days,
  u.pm_interval_miles,
  u.last_pm_date,
  u.last_pm_odometer,
  u.idle_since
from units u
where exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));

-- unit_hos_status.driver_id is always null by design (Samsara's and
-- Alvys's driver id spaces don't line up -- see samsara-hos-sync's own
-- header comment); the app's Tracking page instead gets to a duty
-- status by going driver -> unit_current_trip (has both driver_id and
-- unit_id) -> unit_hos_status (keyed by unit_id). Same path here, so
-- this view only has a duty status for a driver currently tracked
-- against a unit via an active trip -- the rest come through as null,
-- same as the Tracking page would show them.
create or replace view planning_driver_compliance_v as
select
  d.id as driver_id,
  d.name as driver_name,
  d.is_active,
  d.status,
  d.driver_type,
  d.fleet_name,
  uct.unit_id,
  uhs.duty_status,
  uhs.drive_remaining_minutes,
  uhs.shift_remaining_minutes,
  uhs.cycle_remaining_minutes,
  sc.overall_score,
  sc.hos_score,
  sc.safety_score,
  sc.speeding_score,
  sc.score_band,
  (
    select count(*) from missing_dvirs md
    where md.driver_id = d.id and md.trip_start_time >= now() - interval '30 days'
  ) as missing_dvir_count_30d
from drivers d
left join unit_current_trip uct on uct.driver_id = d.id
left join unit_hos_status uhs on uhs.unit_id = uct.unit_id
left join driver_safety_scorecard sc on sc.driver_id = d.id
where exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));

create or replace view planning_loads_v as
select
  al.alvys_load_id,
  al.load_number,
  al.customer_name,
  al.status,
  al.loaded_miles,
  al.linehaul_amount,
  al.customer_rate_amount,
  al.stops,
  al.scheduled_pickup_at,
  al.scheduled_delivery_at,
  al.pickup_window_end,
  al.pickup_appointment_at,
  al.delivery_window_end,
  al.delivery_appointment_at,
  al.picked_up_at,
  al.delivered_at
from alvys_loads al
where al.status not in ('Delivered', 'Cancelled', 'Voided')
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));

-- Trip-level (driver_active_trips) joined with the live current-stop
-- progress (unit_current_trip) where available -- two different grains
-- in the source tables (one row per active trip vs. one row per unit's
-- current stop), left-joined on unit_id so a trip row still shows up
-- even if the current-stop snapshot hasn't synced yet.
create or replace view planning_trips_v as
select
  dat.driver_id,
  dat.unit_id,
  dat.load_number,
  dat.pickup_name,
  dat.pickup_window_start,
  dat.pickup_window_end,
  dat.pickup_appointment_at,
  dat.delivery_name,
  dat.delivery_window_end,
  dat.delivery_appointment_at,
  dat.empty_miles,
  dat.loaded_miles,
  dat.total_miles,
  uct.stop_name as current_stop_name,
  uct.stop_type as current_stop_type,
  uct.stop_lat as current_stop_lat,
  uct.stop_lng as current_stop_lng,
  uct.status as current_stop_status,
  uct.stop_arrived_at as current_stop_arrived_at
from driver_active_trips dat
left join unit_current_trip uct on uct.unit_id = dat.unit_id
where exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));
