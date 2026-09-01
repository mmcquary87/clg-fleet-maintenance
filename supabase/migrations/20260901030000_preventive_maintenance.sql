-- Fleet Maintenance System — Preventive/Scheduled Maintenance forecast
--
-- CLG already has real PM schedules configured in Samsara's own dashboard
-- (confirmed via a schedule export 2026-09-01: Oil Change split by engine
-- make -- Freightliner/Volvo/Mack -- plus separate Penske-leased variants,
-- distance-based; Annual DOT Inspection, date-based, split Trucks/
-- Trailers/Penske Trucks). This mirrors those schedule definitions so the
-- app can forecast "what's coming due in the next N weeks" without
-- depending on Samsara's own due-date math, which is unreliable for the
-- distance-based schedules specifically -- see unit_maintenance_due below.
--
-- Distance/date/engine-hours interval columns are all nullable because a
-- schedule only ever uses one of the three (matches Samsara's own model:
-- exactly one interval type is set per schedule, confirmed from the real
-- export where every row had exactly one of the three interval columns
-- populated).
create table maintenance_schedules (
  id text primary key, -- Samsara Schedule ID
  title text not null,
  distance_interval_miles integer,
  date_interval_days integer,
  engine_hours_interval integer,
  synced_at timestamptz not null default now()
);

-- Seeded from CLG's real Samsara schedule export (2026-09-01) -- these are
-- the actual configured intervals, not a guess. Re-running the eventual
-- samsara-sync-preventive-maintenance function keeps this current if CLG
-- changes a schedule in Samsara later.
insert into maintenance_schedules (id, title, distance_interval_miles, date_interval_days) values
  ('d7357e00-ffe2-4f31-8a8e-1dadf222eded', 'Annual DOT Inspection - Penske Trucks', null, 90),
  ('829d63a2-ff87-4cdb-8b7c-56672b6c230d', 'Annual DOT Inspection - Trucks', null, 365),
  ('4fdcbe7a-5274-4e76-95d2-632aeac3088f', 'Oil Change - Freightliner', 50000, null),
  ('7c1386d5-0604-4f4f-ae18-903e092e0309', 'Oil Change - Penske Freightliner', 64000, null),
  ('e1fb0959-3eaa-4374-b8ad-a65829db36f8', 'Oil Change - Penske Volvo', 55000, null),
  ('db6f548f-d356-4023-a086-6c8e893ecac8', 'Oil Change - Macks', 50000, null),
  ('f5c84c3d-b219-4bd4-994e-2f8648bd7b51', 'Annual DOT Inspection - Trailer', null, 365),
  ('ec4eee6a-e888-409d-acaa-a1ee8251de02', 'Oil Change - Volvo', 55000, null),
  ('708e6ff2-398b-4f09-a6d3-aa18f6496703', 'Oil Change - Freightliner', 65000, null)
on conflict (id) do nothing;

-- One row per (unit, schedule) currently open instance -- full-snapshot
-- sync like unit_current_trip: a resolved/no-longer-applicable instance
-- just gets deleted and re-created as a new cycle by the sync, not
-- versioned here.
--
-- due_date is always the field to read regardless of basis:
--   'samsara_date'    -- date-based schedule; Samsara's own Scheduled
--                         Date/Days Remaining, trustworthy as-is.
--   'estimated_from_mileage_rate' -- distance-based schedule. Samsara's
--                         own Distance Remaining is NOT used here -- every
--                         Oil Change instance in CLG's account has a blank
--                         "Last serviced at," so Samsara's target odometer
--                         is a stale one-time baseline, not a real
--                         service history (confirmed from the real export:
--                         some units showed >90,000 mi "overdue," which
--                         isn't credible for a truck still in service).
--                         Instead this is derived from units.last_pm_date
--                         (already set whenever a PM/Oil work order closes
--                         in this app) plus a trailing real mileage rate
--                         (same distanceTraveledMeters-based method
--                         samsara-miles/samsara-fleet-mpg already use) to
--                         back out an estimated odometer-at-last-service,
--                         then project forward to a calendar date.
--   'no_last_pm_on_file' -- distance-based schedule, but the unit has no
--                         last_pm_date at all -- nothing to project from.
--                         due_date is null; surfaced as "no data," not a
--                         guess.
create table unit_maintenance_due (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  schedule_id text not null references maintenance_schedules(id),
  current_odometer integer,
  due_date date,
  basis text not null, -- 'samsara_date' | 'estimated_from_mileage_rate' | 'no_last_pm_on_file'
  synced_at timestamptz not null default now(),
  unique (unit_id, schedule_id)
);

alter table maintenance_schedules enable row level security;
alter table unit_maintenance_due enable row level security;

create policy "authenticated_all_maintenance_schedules" on maintenance_schedules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_unit_maintenance_due" on unit_maintenance_due
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
