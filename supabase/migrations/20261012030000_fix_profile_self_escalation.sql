-- Security fix (2026-10-12 review): "profiles_update_own_name" lets a user
-- update their own profiles row (`using (auth.uid() = id)`), but RLS is
-- row-level only -- it never actually restricted the policy to the `name`
-- column despite its name. Any authenticated user could run
--
--   update profiles set role = 'admin', can_edit_roster = true,
--     can_void_work_orders = true, can_use_mechanic_queue = true
--   where id = auth.uid();
--
-- and self-grant admin plus every permission flag, since nearly every other
-- role-gated policy in this schema (roster writes, home-time approval,
-- accountability writes, the work-order-void trigger) trusts these same
-- profiles columns via `exists (select 1 from profiles p where p.id =
-- auth.uid() and ...)`. invite-user/update-user-permissions (the only
-- legitimate way these should ever change) already run server-side with
-- the service-role key after independently verifying the caller is an
-- admin -- no real workflow needs a user able to change their own role or
-- permission flags, so blocking it here costs nothing.
create or replace function prevent_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The admin edge functions write via the service-role key -- let those
  -- through untouched. Everything else goes through a user's own JWT.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.can_edit_roster is distinct from old.can_edit_roster
    or new.can_void_work_orders is distinct from old.can_void_work_orders
    or new.can_use_mechanic_queue is distinct from old.can_use_mechanic_queue
    or new.driver_id is distinct from old.driver_id
  then
    raise exception 'Cannot change role or permission flags on your own profile.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_self_escalation_trigger on profiles;
create trigger prevent_profile_self_escalation_trigger
  before update on profiles
  for each row
  execute function prevent_profile_self_escalation();
