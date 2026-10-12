-- Fix for 20261012030000_fix_profile_self_escalation.sql: that trigger
-- correctly blocks a regular logged-in user's own JWT-authenticated
-- request from changing role/permission columns on their own profile, but
-- it also unintentionally blocked a direct Supabase SQL Editor / dashboard
-- query from doing the same thing -- auth.role() returns NULL (not
-- 'service_role') when there's no request.jwt.claims context at all,
-- which is exactly the SQL Editor's case, so the original trigger raised
-- its exception there too.
--
-- The SQL Editor already requires full project-owner/dashboard
-- credentials -- a much higher trust bar than an app-level user JWT -- so
-- it's safe to let that path through alongside the service-role path.
create or replace function prevent_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.can_edit_roster is distinct from old.can_edit_roster
    or new.can_void_work_orders is distinct from old.can_void_work_orders
    or new.can_delete_work_orders is distinct from old.can_delete_work_orders
    or new.can_use_mechanic_queue is distinct from old.can_use_mechanic_queue
    or new.driver_id is distinct from old.driver_id
  then
    raise exception 'Cannot change role or permission flags on your own profile.';
  end if;

  return new;
end;
$$;
