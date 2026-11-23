-- Fleet Maintenance System — Samsara coaching sessions + speeding-coaching suggestions (2026-11-23)
--
-- Direction: Safety Inbox speeding events (Heavy / Severe only) that are Coached in Samsara
-- should end up in the Accountability menu as incidents. No Samsara feed exposes the coaching
-- state of an individual speeding event (/speeding-intervals/stream has only isDismissed;
-- /fleet/safety-events and its audit-log feed carry no speeding events at all). The one feed that
-- shows speeding being coached is /coaching/sessions/stream, which is per DRIVER + behavior type
-- + completion time, not per event. So this does NOT create incidents automatically: the sync
-- stores the sessions, a query pairs each completed session with that driver's Heavy/Severe
-- speeding episodes just before it, and the Accountability screen shows those as suggestions a
-- person confirms (or dismisses) one at a time.
--
-- Confirming writes a normal driver_incidents row (samsara_event_id = the suggestion key, which
-- the existing unique index on (samsara_event_id, infraction_id) makes idempotent).
--
-- BACK OUT: drop table accountability_dismissed_suggestions; drop table samsara_coaching_sessions;

create table if not exists samsara_coaching_sessions (
  id text primary key,                        -- Samsara coaching session id
  samsara_driver_id text not null,
  driver_id text references drivers(id),      -- null when the Samsara driver is not matched to a CLGOS driver
  session_status text,                        -- completed | ...
  coaching_type text,                         -- selfCoaching | ...
  coach_id text,                              -- Samsara user id of the coach who completed it
  coach_name text,                            -- best-effort lookup; null if not resolvable
  due_at timestamptz,
  completed_at timestamptz,
  updated_at_samsara timestamptz,
  behavior_types text[] not null default '{}', -- coachableBehaviorType values; '' = not specified
  synced_at timestamptz not null default now()
);

create index if not exists samsara_coaching_sessions_driver_idx on samsara_coaching_sessions (driver_id, completed_at);
create index if not exists samsara_coaching_sessions_completed_idx on samsara_coaching_sessions (completed_at);

alter table samsara_coaching_sessions enable row level security;
create policy "samsara_coaching_sessions_select_all" on samsara_coaching_sessions
  for select using (auth.role() = 'authenticated');
create policy planning_agent_deny on samsara_coaching_sessions
  as restrictive for all to authenticated
  using (not is_planning_agent()) with check (not is_planning_agent());

-- Suggestions someone reviewed and decided are NOT an incident, so they stop showing.
create table if not exists accountability_dismissed_suggestions (
  suggestion_key text primary key,
  dismissed_by uuid,
  dismissed_at timestamptz not null default now()
);

alter table accountability_dismissed_suggestions enable row level security;
create policy "accountability_dismissed_suggestions_select_all" on accountability_dismissed_suggestions
  for select using (auth.role() = 'authenticated');
create policy "accountability_dismissed_suggestions_write_admin_safety" on accountability_dismissed_suggestions
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'safety'))
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'safety'))
  );
create policy planning_agent_deny on accountability_dismissed_suggestions
  as restrictive for all to authenticated
  using (not is_planning_agent()) with check (not is_planning_agent());
