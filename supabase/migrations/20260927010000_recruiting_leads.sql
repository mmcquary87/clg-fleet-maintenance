-- Fleet Maintenance System — Owner-Operator Recruiting: lead database (module 1)
--
-- First module of the CLG Owner-Operator Recruiting System (see
-- RECRUITING.md for the full handover doc this was built from). Rebuilt
-- onto CLG OS's own stack (Supabase Postgres + Edge Functions) rather
-- than the handover doc's suggested Python/FastAPI/Alembic stack --
-- CLG OS is deliberately "no server to babysit" (see CLAUDE.md), and
-- introducing a separately-hosted service would break that. Migrations
-- via SQL Editor, edge functions via the dashboard's Via Editor flow,
-- same as every other integration in this repo.
--
-- Scoped to just `leads` for this session, per the handover doc's own
-- "build one module per session" discipline (section 7) -- vetting_flags,
-- conversations, screening_answers, onboarding_steps, and events are
-- later modules, not built here.

create type lead_source as enum ('aljex', 'fmcsa', 'job_post', 'referral');
create type lead_segment as enum ('new_mc', 'small_fleet', 'driver');
create type lead_status as enum (
  'new', 'vetted', 'contacted', 'screening', 'qualified', 'recruiter_review', 'onboarding', 'leased_on',
  'disqualified', 'not_interested', 'opted_out'
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  source lead_source not null,
  segment lead_segment,
  status lead_status not null default 'new',
  mc_number text,
  dot_number text,
  name text,
  company text,
  phone text,
  email text,
  home_base text,
  power_units integer,
  authority_date date,
  fit_score numeric(5, 2),
  opt_in_sms boolean not null default false,
  opt_in_sms_at timestamptz,
  opt_in_sms_method text,
  created_at timestamptz not null default now()
);

-- A carrier already sourced by DOT number shouldn't get re-imported as a
-- duplicate lead on a later FMCSA pull -- dot_number is nullable (a
-- referral or job_post lead may not have one yet), so this is a partial
-- unique index rather than a plain unique constraint.
create unique index idx_leads_dot_number on leads(dot_number) where dot_number is not null;
create index idx_leads_status on leads(status);
create index idx_leads_source on leads(source);

alter table leads enable row level security;
create policy "authenticated_all_leads" on leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
