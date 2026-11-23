-- Fleet Maintenance System — log Samsara-"coached" Safety Inbox events as accountability incidents
-- (2026-11-23)
--
-- Direction: any Safety Inbox event marked Coached in Samsara should appear in the
-- Accountability menu as a logged incident, for events on or after 2026-11-02 only.
--
-- Source: driver_safety_events (synced from Samsara /fleet/safety-events every 15
-- minutes by samsara-sync-driver-safety), which carries coaching_state and the
-- behavior labels (Following Distance, Roadside Parking, Harsh Brake, Harsh Turn,
-- Ran Red Light, Rolling Stop, ...). Labels are mapped to infractions through the
-- existing accountability_infraction_patterns (match_type = 'safety_label'), the
-- same mapping the scorecard uses -- no second copy of it here.
--
-- NOT covered: Samsara speeding events (e.g. "Heavy Speeding"). They come from a
-- different feed (/speeding-intervals/stream) whose records carry only isDismissed,
-- no coaching state, so a coached speeding event cannot be detected from the data
-- this app syncs. Needs a source that exposes that state.
--
-- Design:
--  * One incident per (Samsara event, mapped infraction): unique index on
--    (samsara_event_id, infraction_id) makes the whole thing idempotent -- the sync
--    re-writes the last 90 days of events every 15 minutes, which must never
--    duplicate an incident.
--  * Does not change any score: infractions with a safety_label pattern are already
--    scored from the event itself, and the scorecard's manual-incident term excludes
--    infractions that have patterns, so this cannot double count.
--  * Coaching stage = the ladder's suggestion, capped at 'Third Infraction'. CLG
--    direction (2026-10-28) is that stages are only ever suggested and a person
--    decides; an automatic job must never create a fine / Final Warning /
--    Termination stage.
--  * A failure while logging never blocks the Samsara sync (trigger swallows errors
--    into a warning).
--  * If an event is later dismissed in Samsara, the incident already logged is left
--    for a person to review; nothing is deleted automatically.
--
-- BACK OUT: drop trigger driver_safety_events_log_coached on driver_safety_events;
--           and, to remove what it created:
--           delete from driver_incidents where samsara_event_id is not null;

alter table driver_incidents add column if not exists samsara_event_id text;

create unique index if not exists driver_incidents_samsara_event_uidx
  on driver_incidents (samsara_event_id, infraction_id)
  where samsara_event_id is not null;

create or replace function log_coached_safety_event(p_event_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev driver_safety_events%rowtype;
  rec record;
  v_stage accountability_coaching_stage;
  v_unit text;
  v_rows integer;
  n integer := 0;
begin
  select * into ev from driver_safety_events where id = p_event_id;
  if not found or ev.driver_id is null then return 0; end if;
  if lower(coalesce(ev.coaching_state, '')) <> 'coached' then return 0; end if;
  if ev.event_time < timestamptz '2026-11-02 00:00 America/New_York' then return 0; end if;

  select number into v_unit from units where samsara_vehicle_id = ev.samsara_vehicle_id limit 1;

  for rec in
    select distinct i.id as infraction_id, i.name as infraction_name, i.violation_family
    from jsonb_array_elements(ev.behavior_labels) l
    join accountability_infraction_patterns p
      on p.match_type = 'safety_label' and (l ->> 'name') ilike p.match_value
    join accountability_infractions i on i.id = p.infraction_id
  loop
    v_stage := accountability_suggested_coaching_stage(ev.driver_id, rec.violation_family);
    if v_stage in ('Driver Being Fined', 'Final Warning', 'Termination') then
      v_stage := 'Third Infraction';
    end if;

    insert into driver_incidents (driver_id, event_date, infraction_id, coaching_stage, notes, issued_by, samsara_event_id)
    values (
      ev.driver_id,
      (ev.event_time at time zone 'America/New_York')::date,
      rec.infraction_id,
      v_stage,
      'Auto-logged from a Samsara Safety Inbox event marked Coached. Event: ' || rec.infraction_name ||
        ' at ' || to_char(ev.event_time at time zone 'America/New_York', 'Mon DD, YYYY HH12:MI AM') || ' ET' ||
        case when v_unit is not null then ', unit ' || v_unit else '' end ||
        '. Stage is the ladder suggestion (capped at Third Infraction); review before escalating.',
      'Samsara Safety Inbox (auto-logged)',
      ev.id
    )
    on conflict (samsara_event_id, infraction_id) where samsara_event_id is not null do nothing;

    get diagnostics v_rows = row_count;
    n := n + v_rows;
  end loop;

  return n;
end;
$$;

revoke all on function log_coached_safety_event(text) from public, anon, authenticated;

create or replace function trg_log_coached_safety_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform log_coached_safety_event(new.id);
  exception when others then
    raise warning 'log_coached_safety_event(%) failed: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function trg_log_coached_safety_event() from public, anon, authenticated;

-- Fires on insert and whenever coaching_state or driver_id is written (the sync
-- upserts every event each run, so this also catches an event that becomes
-- Coached later, or gets its driver attributed later). Idempotent by the index.
create trigger driver_safety_events_log_coached
  after insert or update of coaching_state, driver_id on driver_safety_events
  for each row
  when (lower(coalesce(new.coaching_state, '')) = 'coached')
  execute function trg_log_coached_safety_event();

-- One-time backfill of events already in the table, oldest first so the ladder
-- suggestion advances in event order.
do $$
declare r record;
begin
  for r in
    select id from driver_safety_events
    where lower(coalesce(coaching_state, '')) = 'coached'
      and event_time >= timestamptz '2026-11-02 00:00 America/New_York'
    order by event_time
  loop
    perform log_coached_safety_event(r.id);
  end loop;
end $$;
