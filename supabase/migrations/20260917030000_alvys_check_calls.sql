-- Fleet Maintenance System — real Alvys check-call data (2026-09-17)
--
-- Replaces the manual-entry check_calls table/board (20260916030000,
-- shipped a day earlier) with a read-only sync of Alvys's own native
-- Check Calls feature. CLG confirmed (2026-09-17) dispatchers already log
-- calls there for every load via Alvys's own UI -- the manual local log
-- was duplicating real work already happening in Alvys, not filling a
-- gap. Per CLG's own spec draft (Check_Calls_Tracking_Spec.md): this is
-- an additive, non-authoritative, READ-ONLY layer -- CLG OS reads check
-- calls, it never writes them back to Alvys.
--
-- Source: GET /trips/{tripId}/check-calls (tripId = Alvys's internal GUID
-- Id, confirmed via alvys-explore-checkcalls-endpoint -- TripNumber
-- 404s). Not a global search -- polled per active trip, using the trip
-- list alvys-sync-active-trips already keeps fresh in driver_active_trips.
--
-- id is Alvys's own Id, not regenerated -- upserting by it is what makes
-- re-polling idempotent (same natural-key convention as
-- alvys_maintenance_id on work_orders).

create table alvys_check_calls (
  id text primary key,
  trip_id text not null, -- Alvys TripId (GUID) -- the endpoint's own path param
  load_number text,
  trip_number text,
  description text,
  activity text,
  response_type text,
  driver_name text,
  location_address text,
  location_lat numeric,
  location_lng numeric,
  reefer_setpoint_temp numeric,
  reefer_return_temp numeric,
  created_at timestamptz not null, -- the check-call event time, from Alvys -- not our ingestion time
  created_by text,
  ingested_at timestamptz not null default now(),
  unit_id uuid references units(id) on delete set null -- best-effort, via driver_active_trips.unit_id at sync time
);

create index idx_alvys_check_calls_trip_id on alvys_check_calls(trip_id);
create index idx_alvys_check_calls_created_at on alvys_check_calls(created_at);

alter table alvys_check_calls enable row level security;
create policy "authenticated_read_alvys_check_calls" on alvys_check_calls
  for select using (auth.role() = 'authenticated');
-- No client write policy -- only the service-role sync function writes here,
-- same convention as drivers (another Alvys-sourced, read-only table).

-- Traceability: a work order raised from a defect mentioned in a check
-- call's description links back to it -- same provenance pattern as
-- tractor_inspection_id/alvys_maintenance_id/samsara_reference_id. Text,
-- not the uuid check_calls(id) the old manual table used, since Alvys's
-- own Id is the natural key here.
alter table work_orders add column if not exists alvys_check_call_id text references alvys_check_calls(id) on delete set null;
