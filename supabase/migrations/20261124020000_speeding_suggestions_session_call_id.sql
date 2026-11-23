-- Speeding coaching suggestions: one Samsara coaching session = one step on the ladder
-- (2026-11-24)
--
-- The Accountability screen logs a suggested speeding episode as its own incident. Several
-- episodes matched to the SAME coaching session (one conversation) were each logged with no
-- shared call id, so every one counted as a separate step toward the progressive ladder
-- (8 incidents for 2 sessions on one driver). This ties them together the same way a
-- multi-infraction call is tied together on the Log incident form (see
-- 20261123060000_coaching_call_bundling.sql):
--
--   * the view now returns coaching_call_id = md5('coaching-session:' || session_id)::uuid,
--     the same value for every episode of one session; the screen saves it on the incident;
--   * accountability_suggested_coaching_stage_excluding(driver, family, call_id) is the ladder
--     suggestion that leaves one call out of the count, so every episode of the session being
--     logged is suggested the SAME stage (the session's own, already-logged episodes don't push
--     the next one up a step).
-- Existing incidents keep their (null) call ids; nothing is rewritten here.
--
-- BACK OUT: re-run the view from 20261123040000_speeding_coaching_suggestions_view.sql and
--           drop function accountability_suggested_coaching_stage_excluding(text, text, uuid);

create or replace function accountability_suggested_coaching_stage_excluding(p_driver_id text, p_violation_family text, p_exclude_call uuid)
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
          and (p_exclude_call is null or di.coaching_call_id is distinct from p_exclude_call)
      ) + 1,
      6
    )
  ]
$$;

grant execute on function accountability_suggested_coaching_stage_excluding(text, text, uuid) to authenticated;

create or replace view speeding_coaching_suggestions as
with params as (
  select timestamptz '2026-11-02 00:00 America/New_York' as since
), iv as (
  select s.id, s.driver_id, s.start_time, coalesce(s.end_time, s.start_time) as end_time,
    (s.max_speed_kmh - s.posted_speed_limit_kmh) * 0.621371 as over_mph
  from driver_speeding_intervals s, params p
  where s.driver_id is not null and not s.is_dismissed and s.start_time >= p.since
    and s.max_speed_kmh * 0.621371 <= 85
    and (s.max_speed_kmh - s.posted_speed_limit_kmh) * 0.621371 >= 10
), flagged as (
  select iv.*,
    case when max(end_time) over w is null or start_time - max(end_time) over w > interval '5 minutes' then 1 else 0 end as new_ep
  from iv
  window w as (partition by driver_id order by start_time, id rows between unbounded preceding and 1 preceding)
), numbered as (
  select f.*, sum(new_ep) over (partition by driver_id order by start_time, id) as ep from flagged f
), episodes as (
  select driver_id, ep, min(start_time) as episode_start, max(end_time) as episode_end, max(over_mph) as peak_over_mph
  from numbered group by driver_id, ep
), sessions as (
  select cs.id, cs.driver_id, cs.coach_id, cs.coach_name, cs.completed_at, cs.behavior_types,
    case when cs.behavior_types && array['severeSpeeding', 'maxSpeed'] then 'named' else 'unspecified' end as basis
  from samsara_coaching_sessions cs, params p
  where cs.session_status = 'completed' and cs.driver_id is not null and cs.completed_at >= p.since
    and (cs.behavior_types && array['severeSpeeding', 'maxSpeed'] or '' = any(cs.behavior_types))
), cand as (
  select distinct on (e.driver_id, e.episode_start)
    'speedep:' || e.driver_id || ':' || to_char(e.episode_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as suggestion_key,
    e.driver_id, e.episode_start, e.episode_end, e.peak_over_mph,
    s.id as session_id, s.coach_id, s.coach_name, s.completed_at, s.basis,
    case when 'severeSpeeding' = any(s.behavior_types) then 'Severe Speeding'
         when 'maxSpeed' = any(s.behavior_types) then 'Max Speed' else 'Not specified' end as samsara_behavior
  from sessions s
  join episodes e on e.driver_id = s.driver_id
    and e.episode_start <= s.completed_at
    and e.episode_start >= s.completed_at - case when s.basis = 'named' then interval '72 hours' else interval '6 hours' end
  order by e.driver_id, e.episode_start, (s.basis = 'named') desc, s.completed_at desc
)
select
  c.suggestion_key,
  c.driver_id,
  d.name as driver_name,
  c.episode_start,
  c.episode_end,
  round(c.peak_over_mph::numeric, 1) as peak_over_mph,
  case when c.peak_over_mph >= 15 then 'Severe' else 'Heavy' end as clgos_tier,
  (select i.id from accountability_infractions i
    where i.name = case when c.peak_over_mph >= 15 then 'Severe Speeding' else 'Heavy Speeding' end limit 1) as suggested_infraction_id,
  accountability_suggested_coaching_stage_excluding(c.driver_id, 'Speeding', md5('coaching-session:' || c.session_id)::uuid) as suggested_stage,
  c.session_id,
  c.completed_at as coached_at,
  c.coach_id,
  c.coach_name,
  c.basis,
  c.samsara_behavior,
  md5('coaching-session:' || c.session_id)::uuid as coaching_call_id
from cand c
join drivers d on d.id = c.driver_id
where auth.role() = 'authenticated'
  and not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'planning_agent')
  and not exists (select 1 from driver_incidents di where di.samsara_event_id = c.suggestion_key)
  and not exists (select 1 from accountability_dismissed_suggestions x where x.suggestion_key = c.suggestion_key);

revoke all on speeding_coaching_suggestions from anon;
grant select on speeding_coaching_suggestions to authenticated;
