-- Fleet Maintenance System — freight-planning agent team: write surface
--
-- The one channel the external agent team writes through. Insert-only --
-- it can propose, never update or delete anything, including its own
-- past proposals (status changes are a human triage action). This is
-- the "agents recommend, humans approve" guardrail as a literal grant:
-- there's no RLS policy that lets 'planning_agent' do anything but
-- insert a row here, full stop. Nothing it writes can ever reach Alvys,
-- dispatch, or a driver directly -- a dispatcher/operations/admin user
-- reviews every row in-app before anything happens because of it.

create table planning_recommendations (
  id uuid primary key default gen_random_uuid(),
  agent_role text not null,
  title text not null,
  detail text,
  payload jsonb,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  related_unit_id uuid references units(id),
  related_driver_id text references drivers(id),
  related_load_number text,
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);

create index idx_planning_recommendations_status on planning_recommendations(status);
create index idx_planning_recommendations_agent_role on planning_recommendations(agent_role);
create index idx_planning_recommendations_created_at on planning_recommendations(created_at);

alter table planning_recommendations enable row level security;

create policy "planning_recommendations_insert" on planning_recommendations for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'planning_agent')
);

create policy "planning_recommendations_select" on planning_recommendations for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'dispatcher', 'operations'))
);

-- Triage only: a human may change status/reviewed_by/reviewed_at. No
-- delete policy -- a recommendation is a permanent record once filed,
-- acted on or not, same convention as home_time_requests.
create policy "planning_recommendations_update" on planning_recommendations for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'dispatcher', 'operations'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'dispatcher', 'operations'))
);
