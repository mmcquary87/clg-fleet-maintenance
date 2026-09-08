-- Fleet Maintenance System — per-driver active trip schedule (Reloads page)
--
-- unit_current_trip (20260829000000_proactive_tracking.sql) is keyed
-- uniquely by unit_id and keeps only the single most relevant trip per
-- TRUCK — exactly backwards for a driver-capacity question: an idle truck
-- with no trip has nothing to join a driver through at all, and a driver
-- temporarily between trucks (or whose truck's alvys_asset_id doesn't
-- match a synced unit) drops out of the picture entirely. This is the
-- driver-first equivalent: every Dispatched/In Transit trip assigned to
-- an active driver, independent of whether its truck matched a unit, and
-- keeping BOTH legs' pickup/delivery stop info (not just "the current
-- stop" the way unit_current_trip does) so a driver's queued next trip
-- can be compared against their current one — to see a reload already
-- booked, an empty gap between the two, or an unusually long deadhead on
-- the next leg.
--
-- A driver can have more than one active trip at once (a current In
-- Transit leg plus a queued Dispatched next one), so this is NOT unique
-- on driver_id alone like unit_current_trip is on unit_id — unique on
-- (driver_id, alvys_trip_id) instead, letting the sync upsert every
-- active trip for a driver in one run.

create table driver_active_trips (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null references drivers(id) on delete cascade,
  alvys_trip_id text not null,
  load_number text,
  unit_id uuid references units(id), -- best-effort Truck.Id match; null if none synced
  status text not null, -- Dispatched | In Transit
  pickup_name text,
  pickup_appointment_at timestamptz,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  delivery_name text,
  delivery_appointment_at timestamptz,
  delivery_window_end timestamptz,
  empty_miles numeric,
  loaded_miles numeric,
  total_miles numeric,
  synced_at timestamptz not null default now(),
  unique (driver_id, alvys_trip_id)
);

create index idx_driver_active_trips_driver on driver_active_trips(driver_id);

alter table driver_active_trips enable row level security;
create policy "authenticated_all_driver_active_trips" on driver_active_trips
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
