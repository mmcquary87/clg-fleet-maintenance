-- Accountability: one coaching call = one step on the progressive ladder per family
-- (CLG direction, 2026-11-23)
--
-- The Log incident form lets Safety tick several infractions on one coaching call.
-- Each becomes its own driver_incidents row (points, rollover and fines stay per
-- infraction), but the progressive-discipline ladder is per violation family, so
-- two Speeding infractions covered on the same call are ONE step, not two.
--
--   1. driver_incidents.coaching_call_id: shared by every row saved from one form
--      submit. Null on older rows and on auto-logged / single-event rows, which
--      keep counting individually (exactly the previous behavior).
--   2. accountability_suggested_coaching_stage now counts distinct coaching calls
--      (coalesce(coaching_call_id, id)) per family instead of raw rows.
-- Additive and backward compatible: inserts that omit the column still work.
alter table driver_incidents add column if not exists coaching_call_id uuid;
create index if not exists driver_incidents_coaching_call_idx on driver_incidents (coaching_call_id) where coaching_call_id is not null;

create or replace function accountability_suggested_coaching_stage(p_driver_id text, p_violation_family text)
returns accountability_coaching_stage
language sql
stable
as $$
  select (array[
    'First Infraction', 'Second Infraction', 'Third Infraction',
    'Driver Being Fined', 'Final Warning', 'Termination'
  ]::accountability_coaching_stage[])[
    least(
      (
        select count(distinct coalesce(di.coaching_call_id, di.id))
        from driver_incidents di
        join accountability_infractions inf on inf.id = di.infraction_id
        where di.driver_id = p_driver_id
          and inf.violation_family = p_violation_family
          and di.event_date >= current_date - make_interval(days => inf.rollover_days)
      ) + 1,
      6
    )
  ]
$$;

grant execute on function accountability_suggested_coaching_stage(text, text) to authenticated;
