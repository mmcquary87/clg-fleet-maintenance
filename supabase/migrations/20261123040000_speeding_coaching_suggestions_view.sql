-- Fleet Maintenance System — speeding-coaching suggestions for the Accountability screen (2026-11-23)
--
-- Pairs each completed Samsara coaching session (samsara_coaching_sessions) with that driver's
-- Heavy/Severe speeding EPISODES just before it, as suggested incidents for a person to confirm.
-- See 20261123030000_samsara_coaching_sessions.sql for why this is a suggestion and not automatic.
--
--  * Episodes: speeding intervals >= 10 mph over the limit (CLGOS Heavy = 10-<15, Severe = 15+),
--    <= 85 mph, not dismissed, merged when separated by <= 5 minutes (the same gap the
--    scorecard uses), counted from 2026-11-02 ET onward only.
--  * Sessions: completed, matched to a CLGOS driver. A session whose behavior type is
--    severeSpeeding / maxSpeed is "named": episodes up to 72 hours before it are suggested.
--    A session with a BLANK behavior type ("unspecified" -- could be anything: roadside parking,
--    a harsh brake, speeding) only suggests episodes in the 6 hours before it, and is labelled
--    so the reviewer knows to check.
--  * One suggestion per episode (key = 'speedep:<driver>:<episode start UTC>'); a "named"
--    session wins over an "unspecified" one, then the latest session. Gone once an incident with
--    that key is logged (driver_incidents.samsara_event_id) or it is dismissed.
--  * Default infraction follows CLGOS's own tier from the peak mph over (Severe at 15+). Samsara's
--    Inbox "Heavy"/"Severe" label is defined differently (an 11/12 event showed Heavy at +21 mph
--    while its interval is 20.5 over), so the screen lets the reviewer change it.
--  * Stage = the ladder's suggestion for the Speeding family (a person confirms before logging).
--
-- Access gate in the view itself (signed-in users, not the planning agent); not readable by anon.
--
-- BACK OUT: drop view speeding_coaching_suggestions;

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
  accountability_suggested_coaching_stage(c.driver_id, 'Speeding') as suggested_stage,
  c.session_id,
  c.completed_at as coached_at,
  c.coach_id,
  c.coach_name,
  c.basis,
  c.samsara_behavior
from cand c
join drivers d on d.id = c.driver_id
where auth.role() = 'authenticated'
  and not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'planning_agent')
  and not exists (select 1 from driver_incidents di where di.samsara_event_id = c.suggestion_key)
  and not exists (select 1 from accountability_dismissed_suggestions x where x.suggestion_key = c.suggestion_key);

revoke all on speeding_coaching_suggestions from anon;
grant select on speeding_coaching_suggestions to authenticated;
