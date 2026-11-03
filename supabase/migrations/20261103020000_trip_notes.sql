-- Fleet Maintenance System — Tracking page dispatcher notes
--
-- Lets a dispatcher log a free-text note against a tracked trip (e.g.
-- "called driver, running 30 min behind due to traffic") and optionally
-- tag it with a quick triage status. This is a CLGOS-only signal --
-- Alvys exposes no way to write data back (read-only, see
-- alvys-sync-active-trips's own header), so a trip's real Dispatched/In
-- Transit status can never be edited from here. "Change the status" per
-- CLG direction (2026-11-03) means this new dispatcher-set tag, not an
-- edit to Alvys's own field.
--
-- Keyed to alvys_trip_id (driver_active_trips' stable per-trip id, also
-- what alvys_check_calls keys on) rather than unit_id or driver_id, so a
-- note stays tied to the specific load even if the same truck/driver
-- starts a new trip. load_number is denormalized (same reasoning as
-- work_order_activity_log's wo_number) so a note still reads sensibly
-- once the trip delivers and drops out of driver_active_trips/
-- unit_current_trip entirely.
--
-- Append-only, same spirit as work_order_activity_log/roster_change_log
-- -- no update/delete policy. A dispatcher note log that can be edited
-- after the fact isn't a reliable record of what was actually checked.

create type trip_note_status as enum ('Checked OK', 'Needs Follow-up', 'Resolved');

create table trip_notes (
  id uuid primary key default gen_random_uuid(),
  alvys_trip_id text not null,
  load_number text,
  status trip_note_status,
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint trip_notes_note_or_status check (note is not null or status is not null)
);

create index idx_trip_notes_alvys_trip_id on trip_notes(alvys_trip_id);
create index idx_trip_notes_created_at on trip_notes(created_at);

alter table trip_notes enable row level security;
create policy "trip_notes_select_all" on trip_notes for select using (auth.role() = 'authenticated');
create policy "trip_notes_insert_all" on trip_notes for insert with check (auth.role() = 'authenticated');
