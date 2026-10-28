-- Driver Safety / Accountability — foundational rebuild, Phase 2
--
-- accountability_infractions.rollover_days (60-day point decay) has been
-- display-only since it was introduced (20261028010000's own comment: "No
-- scoring view currently filters by rollover_days -- purely a data
-- change"). In practice this meant the official doc's "Progressive
-- Accountability" ladder was never actually live logic -- coaching_stage on
-- driver_incidents is a free-pick dropdown with nothing behind it; a human
-- decides the stage from memory every time, with no system support for
-- "how many active same-family infractions does this driver already have."
--
-- This adds a suggestion, not automation (CLG direction, 2026-10-28):
-- accountability_suggested_coaching_stage(driver_id, violation_family)
-- counts the driver's ACTIVE (event_date within that infraction's own
-- rollover_days) same-family infractions and maps the count to the next
-- stage in the 6-step ladder. LogIncidentForm.jsx calls it to pre-fill the
-- coaching-stage dropdown once a driver + infraction are picked -- Safety
-- can still pick a different stage (the doc's "may skip steps" provision).
-- Nothing auto-escalates; a human still submits the form either way.
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
        select count(*)
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
