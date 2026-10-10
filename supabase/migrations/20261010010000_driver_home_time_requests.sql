-- Fleet Maintenance System — driver self-service home-time requests
--
-- First piece of "driver engagement": drivers get their own staff-created
-- login (invited the same way mechanics are, via invite-user + Settings)
-- and can request home-time/time off themselves instead of only dispatch
-- entering standing schedules on their behalf (planned_home_time, which
-- stays untouched -- this is a separate request/approval intake layer,
-- not a replacement for it).
--
-- A driver's auth login has never been linked to a real driver record
-- before now -- profiles, drivers, driver_roster and planned_home_time
-- were four unlinked-to-auth entities. profiles.driver_id closes that gap
-- (nullable: only meaningful for role = 'driver' logins).

alter type user_role add value if not exists 'driver';

alter table profiles add column if not exists driver_id text references drivers(id);

-- Carries driver_id through on invite, same reasoning as
-- 20260828040000_invite_user_role.sql did for role: the invite-user edge
-- function passes it as invite metadata, read here into the new profiles
-- row. Falls back to null (e.g. users invited directly from the Supabase
-- dashboard, or any non-driver role).
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, driver_id)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'dispatcher'),
    new.raw_user_meta_data->>'driver_id'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create table home_time_requests (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null references drivers(id),
  requested_by uuid not null default auth.uid() references auth.users(id),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_home_time_requests_driver_id on home_time_requests(driver_id);
create index idx_home_time_requests_status on home_time_requests(status);

alter table home_time_requests enable row level security;

-- A driver sees only their own requests (matched via their own
-- profiles.driver_id); admin/roster-editors see every request, same
-- permission boundary planned_home_time and driver_roster already use.
create policy "home_time_requests_select" on home_time_requests for select using (
  exists (
    select 1 from profiles p where p.id = auth.uid()
    and (p.role = 'admin' or p.can_edit_roster or p.driver_id = home_time_requests.driver_id)
  )
);

-- A driver may only ever file a request against their own linked
-- driver_id, never on another driver's behalf.
create policy "home_time_requests_insert" on home_time_requests for insert with check (
  requested_by = auth.uid()
  and exists (select 1 from profiles p where p.id = auth.uid() and p.driver_id = home_time_requests.driver_id)
);

-- Deciding (approve/deny) is staff-only -- same admin-or-can_edit_roster
-- gate as every other write on this roster/home-time surface. No delete
-- policy: a request is a permanent record once filed, decided or not.
create policy "home_time_requests_update" on home_time_requests for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
);
