-- Fleet Maintenance System — Planned Home Time (recurring schedules)
--
-- Separate from driver_roster: the roster tracks exceptions (why a driver
-- can't work right now), this tracks standing commitments (when a driver
-- is scheduled to be home on a recurring basis) — feeds KPI 17 (Driver
-- Schedule Adherence) once there's a way to compare planned vs. actual.
--
-- Supports three cadences: every week, every other week (anchor_date
-- establishes which week is "on"), and "Nth weekday of the month" (e.g.
-- "1st Saturday" — covers things like "first weekend of the month").
--
-- Reuses roster_change_log for the audit trail (same governance model —
-- name + reason on every change) rather than a duplicate log table; the
-- new `domain` column keeps the two features' entries distinguishable.

create type home_time_cadence as enum ('weekly', 'biweekly', 'monthly_nth');

create table planned_home_time (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  cadence home_time_cadence not null default 'weekly',
  days_of_week smallint[] not null default '{}', -- 0=Sunday..6=Saturday
  anchor_date date, -- required for biweekly, to establish the "on" week
  month_occurrence smallint, -- for monthly_nth: 1-4, or -1 for "last"
  effective_start_date date not null,
  effective_end_date date, -- null = ongoing
  approval text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table roster_change_log add column if not exists domain text not null default 'roster';

alter table planned_home_time enable row level security;

create policy "home_time_select_all" on planned_home_time for select using (auth.role() = 'authenticated');
create policy "home_time_write_permitted" on planned_home_time for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or p.can_edit_roster))
);
