-- Fleet Maintenance System — planning_agent: see its own recent recommendations
--
-- planning_recommendations is insert-only for planning_agent (no select
-- policy, by design), which left the agents unable to tell whether the
-- thing they were about to file had already been filed -- or dismissed by
-- a human -- on a previous scheduled run. Without that, a recurring agent
-- re-files the same recommendation every run. This narrow view (last 7
-- days, no payload/detail, status included so a dismissed item isn't
-- nagged again) is the only read path back. Same in-view role gate as the
-- other planning_*_v views.

create or replace view planning_open_recommendations_v as
select
  pr.id, pr.agent_role, pr.title, pr.priority, pr.status,
  pr.related_unit_id, pr.related_driver_id, pr.related_load_number, pr.created_at
from planning_recommendations pr
where pr.created_at >= now() - interval '7 days'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('planning_agent', 'admin'));
