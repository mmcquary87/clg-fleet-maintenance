-- Fleet Maintenance System — proactive tracking (location + ETA)
--
-- Backs the new Tracking page: live GPS coordinates on units, plus two
-- per-unit tables for the data needed to compute an HOS-aware ETA — the
-- unit's current in-transit destination (from Alvys) and its current HOS
-- clock status (from Samsara). samsara-sync already pulls a GPS reading
-- for every unit every 15 minutes (see 20260828150000_samsara_sync_schedule.sql)
-- but only kept the human-readable address — this adds lat/lng so
-- distance/ETA math is possible.
--
-- unit_current_trip and unit_hos_status start out empty: the real sync
-- functions that populate them depend on confirming exact Samsara HOS API
-- and Alvys active-trip shapes first (see the samsara-explore-hos and
-- alvys-explore-active-trips Edge Functions — temporary probes, same
-- pattern as alvys-explore-drivers/alvys-explore-trips).

alter table units add column current_lat numeric(9, 6);
alter table units add column current_lng numeric(9, 6);

-- One row per unit currently on an active (not yet delivered) load.
create table unit_current_trip (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references units(id) on delete cascade,
  alvys_trip_id text,
  driver_id text references drivers(id),
  destination_name text,
  destination_lat numeric(9, 6),
  destination_lng numeric(9, 6),
  delivery_appointment_at timestamptz,
  delivery_window_end timestamptz,
  status text,
  synced_at timestamptz not null default now()
);

-- One row per unit's driver's current Hours of Service clocks.
create table unit_hos_status (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references units(id) on delete cascade,
  driver_id text references drivers(id),
  duty_status text,
  drive_remaining_minutes integer,
  shift_remaining_minutes integer,
  cycle_remaining_minutes integer,
  synced_at timestamptz not null default now()
);

alter table unit_current_trip enable row level security;
alter table unit_hos_status enable row level security;

create policy "authenticated_all_unit_current_trip" on unit_current_trip
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_unit_hos_status" on unit_hos_status
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
