-- Fleet Maintenance System — carry role through on invite
--
-- handle_new_user() previously only read full_name out of
-- raw_user_meta_data, always defaulting role to 'dispatcher' regardless
-- of what the inviting admin picked. The new invite-user edge function
-- passes { full_name, role } as invite metadata — read role from there
-- too, falling back to 'dispatcher' when absent (e.g. users invited
-- directly from the Supabase dashboard, which doesn't set this).

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'dispatcher')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
