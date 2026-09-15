-- Fleet Maintenance System — check-call board (2026-09-16)
--
-- Replaces CLG's per-day Excel workbook (one tab per day, hundreds of
-- them, a single freeform comment cell each dispatcher appends
-- initials/timestamp/note to) with a real per-call log: one row per
-- hourly check-in, each individually searchable instead of buried in a
-- concatenated text blob. Lives inside the existing Tracking tab (CLG,
-- 2026-09-15: "bring the GPS/ETA/HOS data into this and have it all
-- combined into 1 tab") — the drivers who need calling are read from the
-- same live Alvys trip data useTracking already resolves, not a
-- separately maintained roster.
--
-- Confirmed via the alvys-explore-check-calls probe (2026-09-15): Alvys's
-- trips/loads APIs expose no check-call/dispatch-note/call-log field —
-- the closest thing is a stop's Eta.Manual override, which carries no
-- timestamp or free text and can't serve as a call log. This is
-- necessarily local, manual-entry data.

create table check_calls (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  unit_number text, -- denormalized snapshot, same reasoning as driver_name below
  driver_id text references drivers(id) on delete set null,
  driver_name text, -- denormalized snapshot -- a call log should still read sensibly if the driver/unit link later changes
  alvys_trip_id text,
  load_number text,

  call_hour timestamptz not null, -- the hour-slot this call covers, truncated to the hour
  logged_at timestamptz not null default now(),
  logged_by text not null, -- dispatcher's name/initials at time of entry

  note text not null,
  free_time_expires_at timestamptz, -- detention/free-time clock, if this call set one
  off_duty boolean not null default false, -- marks the driver off duty from this hour forward -- stops "hour passed, no call" flags for the rest of the day

  created_at timestamptz not null default now()
);

create index idx_check_calls_unit_call_hour on check_calls(unit_id, call_hour);
create index idx_check_calls_call_hour on check_calls(call_hour);

alter table check_calls enable row level security;
create policy "authenticated_all_check_calls" on check_calls
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Traceability: a work order raised from a defect reported mid-call links
-- back to the call that raised it -- same provenance pattern as
-- tractor_inspection_id/alvys_maintenance_id/samsara_reference_id.
alter table work_orders add column if not exists check_call_id uuid references check_calls(id) on delete set null;
