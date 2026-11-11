-- Fleet Maintenance System — planning_agent: deny by default
--
-- Correction to 20261111000000-20261111020000. Those migrations gave the
-- external agent team's service account a narrow read surface (four
-- views) and one insert-only table, and the agent-team README said it had
-- nothing else. That was not true: most CLGOS tables carry a permissive
-- policy of the form `auth.role() = 'authenticated'` (any logged-in user,
-- full access), and a planning_agent login is an authenticated user.
-- Verified 2026-11-11 by signing in as that account and reading the raw
-- `units` table, which succeeded.
--
-- RESTRICTIVE policies are ANDed with every permissive policy, so one
-- deny policy per table closes this without touching any existing
-- policy. is_planning_agent() is false for every other user, so nothing
-- changes for existing roles. The four planning_*_v views keep working:
-- they run with their owner's privileges (planning_driver_compliance_v
-- already returns rows from `drivers`, whose own SELECT policy excludes
-- this role), so table RLS never applied to them. They are the intended,
-- column-scoped read path, and each gates on the role itself.
--
-- planning_recommendations is excluded: its own policies are the intended
-- insert-only grant. New tables added later are NOT covered
-- automatically; re-run the DO block (it is idempotent) after adding one.

create or replace function is_planning_agent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'planning_agent');
$$;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname <> 'planning_recommendations'
  loop
    execute format('drop policy if exists planning_agent_deny on public.%I', t.relname);
    execute format(
      'create policy planning_agent_deny on public.%I as restrictive for all to authenticated using (not is_planning_agent()) with check (not is_planning_agent())',
      t.relname
    );
  end loop;
end $$;
