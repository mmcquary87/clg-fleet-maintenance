-- Flag drivers who stay signed in to a truck in the Samsara driver app for 48+ hours
-- without driving (2026-11-23). Flag only: no points, no incidents.
--
-- Samsara's /fleet/hos/clocks lists every driver with their current duty status and, for
-- drivers signed in to a vehicle right now, currentVehicle. It has no "signed in since" or
-- "status since" timestamp, so the samsara-sync-driver-app-sessions function (every 15 min)
-- keeps its own snapshot: one row per driver currently attached to a vehicle.
--   attached_since  first time we saw this driver attached to this vehicle
--   idle_since      first time we saw them attached and NOT working (offDuty / sleeperBed);
--                   null while driving or on duty, reset whenever they go back to work
-- A driver is flagged when idle_since is 48+ hours old. Rows disappear when the driver signs
-- out (no longer attached). History starts when this is deployed, so the first possible
-- flag is 48 hours later.
--
-- The table is not readable by app users directly; they read the gated view below.
--
-- BACK OUT: select cron.unschedule('samsara-driver-app-sessions-every-15-min');
--           drop view driver_app_signout_flags; drop table driver_app_sessions;

create table driver_app_sessions (
  samsara_driver_id text primary key,
  driver_id text references drivers(id) on delete set null,
  driver_name text not null,
  vehicle_id text not null,
  vehicle_name text,
  duty_status text not null,
  attached_since timestamptz not null default now(),
  idle_since timestamptz,
  last_seen timestamptz not null default now()
);
alter table driver_app_sessions enable row level security;
revoke all on driver_app_sessions from anon, authenticated;

create or replace view driver_app_signout_flags as
select
  s.samsara_driver_id,
  s.driver_id,
  s.driver_name,
  s.vehicle_name,
  s.duty_status,
  s.attached_since,
  s.idle_since,
  round(extract(epoch from (now() - s.idle_since)) / 3600) as hours_idle
from driver_app_sessions s
where s.idle_since <= now() - interval '48 hours'
  and s.last_seen > now() - interval '2 hours'  -- ignore stale rows if the sync stops
  and auth.role() = 'authenticated'
  and not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'planning_agent');

revoke all on driver_app_signout_flags from anon;
grant select on driver_app_signout_flags to authenticated;
