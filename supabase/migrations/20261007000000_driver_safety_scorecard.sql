-- Fleet Maintenance System — Driver Safety Scorecard data model
--
-- Ports CLG's existing Power BI "Driver Safety Scorecard" report (built on
-- Samsara's official Power BI connector) into CLGos, backed by direct
-- Samsara REST API calls instead. Confirmed via samsara-explore-driver-safety
-- (rounds 1-3) against real data:
--   - /fleet/safety-events: driverIds filter is silently ignored (same
--     gotcha as /fleet/hos/clocks, documented in samsara-hos-sync) — pull
--     everything, match client-side.
--   - /fleet/hos/violations: driverIds filter works correctly here, but the
--     response has no per-violation id (wrapper data:[{violations:[...]}])
--     — rows are keyed by a synthetic id built from driver+time+type.
--   - /fleet/reports/drivers/fuel-energy: wants startDate/endDate as full
--     RFC 3339 timestamps (confusing param names, datetime values).
--   - /speeding-intervals/stream: requires assetIds (comma-separated, no
--     "all" option) + startTime; intervals are nested under trips, no
--     per-interval id — synthetic id built from vehicle+start_time.
--
-- Samsara's driver.id is a different id space than Alvys's (plain numeric
-- vs. "DR25...", same mismatch already documented in samsara-hos-sync) —
-- samsara_driver_id is linked to drivers.id by name match during sync
-- (best-effort, same spirit as units.samsara_vehicle_id being matched by
-- VIN), and is left null where no confident match exists.
--
-- Fuel/Energy is stored as a replaced-each-run snapshot per driver over a
-- trailing window (same pattern as unit_hos_status), not an append log —
-- it's a rate (distance/fuel over a period), not a discrete event.

alter table drivers add column if not exists samsara_driver_id text;
create index if not exists idx_drivers_samsara_driver_id on drivers(samsara_driver_id);

create table if not exists driver_safety_events (
  id text primary key, -- Samsara safety event id
  samsara_driver_id text not null,
  driver_id text references drivers(id),
  samsara_vehicle_id text,
  unit_id uuid references units(id),
  event_time timestamptz not null,
  max_acceleration_g numeric,
  coaching_state text, -- needsCoaching | coached | Dismissed
  behavior_labels jsonb not null default '[]'::jsonb, -- [{label, source, name}]
  video_url text,
  latitude numeric,
  longitude numeric,
  synced_at timestamptz not null default now()
);

create index idx_driver_safety_events_driver_id on driver_safety_events(driver_id);
create index idx_driver_safety_events_samsara_driver_id on driver_safety_events(samsara_driver_id);
create index idx_driver_safety_events_event_time on driver_safety_events(event_time);

alter table driver_safety_events enable row level security;
create policy "driver_safety_events_select_all" on driver_safety_events for select using (auth.role() = 'authenticated');

create table if not exists driver_hos_violations (
  id text primary key, -- synthetic: samsara_driver_id || ':' || violation_start_time || ':' || type
  samsara_driver_id text not null,
  driver_id text references drivers(id),
  day_start timestamptz,
  day_end timestamptz,
  violation_type text,
  description text, -- e.g. "Missed Rest Break", "Shift Driving Limit (USA-11 Hours)"
  violation_start_time timestamptz not null,
  duration_ms bigint,
  synced_at timestamptz not null default now()
);

create index idx_driver_hos_violations_driver_id on driver_hos_violations(driver_id);
create index idx_driver_hos_violations_samsara_driver_id on driver_hos_violations(samsara_driver_id);
create index idx_driver_hos_violations_start_time on driver_hos_violations(violation_start_time);

alter table driver_hos_violations enable row level security;
create policy "driver_hos_violations_select_all" on driver_hos_violations for select using (auth.role() = 'authenticated');

create table if not exists driver_speeding_intervals (
  id text primary key, -- synthetic: samsara_vehicle_id || ':' || start_time
  samsara_vehicle_id text not null,
  unit_id uuid references units(id),
  trip_start_time timestamptz,
  start_time timestamptz not null,
  end_time timestamptz,
  severity_level text, -- light | moderate | heavy | severe
  posted_speed_limit_kmh numeric,
  max_speed_kmh numeric,
  is_dismissed boolean not null default false,
  latitude numeric,
  longitude numeric,
  synced_at timestamptz not null default now()
);

create index idx_driver_speeding_intervals_unit_id on driver_speeding_intervals(unit_id);
create index idx_driver_speeding_intervals_vehicle_id on driver_speeding_intervals(samsara_vehicle_id);
create index idx_driver_speeding_intervals_start_time on driver_speeding_intervals(start_time);

alter table driver_speeding_intervals enable row level security;
create policy "driver_speeding_intervals_select_all" on driver_speeding_intervals for select using (auth.role() = 'authenticated');

create table if not exists driver_fuel_energy (
  samsara_driver_id text primary key,
  driver_id text references drivers(id),
  period_start timestamptz not null,
  period_end timestamptz not null,
  distance_traveled_meters bigint,
  fuel_consumed_ml bigint,
  efficiency_mpge numeric,
  engine_run_time_ms bigint,
  engine_idle_time_ms bigint,
  est_carbon_emissions_kg numeric,
  est_fuel_energy_cost_usd numeric,
  synced_at timestamptz not null default now()
);

create index idx_driver_fuel_energy_driver_id on driver_fuel_energy(driver_id);

alter table driver_fuel_energy enable row level security;
create policy "driver_fuel_energy_select_all" on driver_fuel_energy for select using (auth.role() = 'authenticated');
