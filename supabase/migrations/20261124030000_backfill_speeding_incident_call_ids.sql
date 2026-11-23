-- One-time backfill (2026-11-24): give the speeding incidents already logged from the
-- Accountability suggestions panel the same coaching_call_id their Samsara coaching session
-- now produces (md5('coaching-session:' || session_id)::uuid), so episodes from one session
-- count as one ladder step (see 20261124020000_speeding_suggestions_session_call_id.sql).
-- The session is found by matching the driver and the completion time written into each
-- incident's notes. Only sets coaching_call_id on rows where it is null; no stage, date or
-- other field changes. 11 rows at the time it ran (Aaron Schuler Sr 8 -> 2 calls,
-- Michael Dwight 2, Claude Searcy 1).
--
-- BACK OUT: update driver_incidents set coaching_call_id = null where samsara_event_id like 'speedep:%';
update driver_incidents i
set coaching_call_id = md5('coaching-session:' || s.id)::uuid
from samsara_coaching_sessions s
where i.samsara_event_id like 'speedep:%'
  and i.coaching_call_id is null
  and s.driver_id = i.driver_id
  and s.session_status = 'completed'
  and to_char(s.completed_at at time zone 'America/New_York', 'FMMon FMDD, FMHH12:MI AM') || ' ET' = substring(i.notes from 'completed (.*? ET)');
