-- Fleet Maintenance System — planning_recommendations insert policy: use the helper
--
-- Regression from 20261111030000_planning_agent_deny_by_default.sql. The
-- insert policy from 20261111020000 checked the caller's role with an
-- inline `exists (select 1 from profiles ...)`. Once planning_agent was
-- denied access to `profiles` (correctly), that subquery returned no
-- rows for the planning account and every insert failed with a 403 --
-- found when the first scheduled agent run could read but not file.
-- is_planning_agent() is security definer, so it can see the caller's own
-- profile regardless of what the caller is denied on the table itself.
-- The select/update policies for humans are unaffected (the deny rule
-- only applies to planning_agent).

drop policy if exists "planning_recommendations_insert" on planning_recommendations;
create policy "planning_recommendations_insert" on planning_recommendations for insert with check (is_planning_agent());
