-- Fleet Maintenance System — Governed Driver-Availability Roster
--
-- Ports the "Governed_Driver_Availability_Roster.xlsx" governance file into
-- the app: same fields, same dropdown values, same computed-status logic
-- (Currently Unavailable? / Days Remaining are computed in the app, not
-- stored — mirrors the sheet's live formulas rather than storing a value
-- that can go stale). Feeds D-01/D-02 (KPI 1) and D-13 (KPIs 4, 11, 13)
-- once this is reliably maintained, per the framework's own governance
-- rules — those KPIs stay Pending until this roster is real, not Red.
--
-- Write access (insert/update/delete on all three tables here) is gated to
-- admins or users with profiles.can_edit_roster = true (Settings → Users
-- toggle). Read access is any authenticated user, matching the rest of the
-- app's read model.

create type roster_eligibility as enum ('Eligible', 'Not Eligible');
create type roster_unavailable_reason as enum ('Vacation', 'Personal Leave', 'Sick', 'Medical/Injury', 'Suspension', 'Terminated', 'Other');

create table driver_roster (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  eligibility roster_eligibility not null default 'Eligible',
  unavailable_reason roster_unavailable_reason,
  start_date date,
  end_date date,
  approval text,
  effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roster_change_log (
  id uuid primary key default gen_random_uuid(),
  changed_at timestamptz not null default now(),
  changed_by text not null,
  driver_affected text not null,
  field_changed text not null,
  old_value text,
  new_value text,
  reason text not null
);

-- Singleton row — file owner / version / last reconciliation date, per the
-- framework's "controlled file owner" requirement (Instructions tab).
create table roster_settings (
  id boolean primary key default true,
  file_owner text,
  version text not null default '1.0',
  last_reconciled_date date,
  constraint roster_settings_singleton check (id)
);
insert into roster_settings (id) values (true);

alter table driver_roster enable row level security;
alter table roster_change_log enable row level security;
alter table roster_settings enable row level security;

create policy "roster_select_all" on driver_roster for select using (auth.role() = 'authenticated');
create policy "roster_write_permitted" on driver_roster for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
);

create policy "roster_log_select_all" on roster_change_log for select using (auth.role() = 'authenticated');
create policy "roster_log_write_permitted" on roster_change_log for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
);

create policy "roster_settings_select_all" on roster_settings for select using (auth.role() = 'authenticated');
create policy "roster_settings_write_permitted" on roster_settings for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
);
