-- Fleet Maintenance System — auth + roles
-- Run this in the Supabase SQL Editor after 20260826120000_init_schema.sql.
--
-- Adds a profiles table (1:1 with auth.users) carrying a role, and tightens
-- the data tables' RLS policies to require login. Previously units/vendors/
-- work_orders/fault_events/dvir_defects were readable and writable by ANYONE
-- with the anon key (including the public, since the site is live) — this
-- closes that.

create type user_role as enum ('dispatcher', 'mechanic', 'admin');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'dispatcher',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own_name" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created (e.g. via
-- Authentication -> Users -> Invite user in the Supabase dashboard).
create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Tighten the Phase-1 "dev, anyone with the anon key" policies to
-- "any logged-in user". There's no write UI yet (dashboard is read-only), so
-- this doesn't yet distinguish dispatcher/mechanic/admin on writes — that
-- comes once real write flows (invoice upload, manual work order entry)
-- exist and we know what actually needs restricting. Tracked in
-- DESIGN_QUEUE.md.
-- ---------------------------------------------------------------------------

drop policy "dev_all_units" on units;
drop policy "dev_all_vendors" on vendors;
drop policy "dev_all_work_orders" on work_orders;
drop policy "dev_all_fault_events" on fault_events;
drop policy "dev_all_dvir_defects" on dvir_defects;

create policy "authenticated_all_units" on units for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_vendors" on vendors for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_work_orders" on work_orders for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_fault_events" on fault_events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_dvir_defects" on dvir_defects for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
