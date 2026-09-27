-- Owner-Operator Recruiting — CRM + governed onboarding (part 1 of 3: leads & vetting)
--
-- Split into three files because the Supabase SQL Editor's paste box
-- silently truncated the original single ~800-line migration mid-statement
-- (same large-paste truncation bug seen earlier this session with a large
-- Edge Function paste) -- the original single-file migration never
-- successfully applied, so splitting it doesn't violate the "never edit an
-- already-applied migration" rule.
--
-- RUN ORDER: 20260927030000 (role enum) -> this file -> 040100 -> 040200.
-- Run each in its own SQL Editor tab/paste; none of the three is safe to
-- run out of order or partially.
--
-- Adapted from the clg-recruiting Python build's db/001_init.sql +
-- db/002_crm_onboarding.sql (see RECRUITING.md and the spec doc it names).
--
-- Adaptation decisions (see 20260927030000's header for the role-enum one):
--   * public schema, not a separate `recruiting` schema -- matches every
--     other table in this repo.
--   * profiles is reused as the one identity/role table instead of a new
--     crm_users table -- owner_id/assigned_to below all reference
--     profiles(id). user_role now doubles as the step "owner_role" category
--     enum (recruiter/safety/operations/finance/admin/viewer all exist on
--     it), so there's no separate crm_role type.
--   * field_history attribution uses auth.email() instead of
--     current_setting('app.actor', true) -- Postgres already knows who's
--     asking via the request's JWT; no session variable to set.
--   * RLS: broad "authenticated" policy on every table, matching every
--     other table in this app. Fine-grained per-role RLS is the source
--     spec's own Phase 2 item, not solved here.
--   * Onboarding templates seed as DRAFT. Nothing here is approved -- the
--     clear-to-dispatch gate (part 3) refuses to clear a case on a
--     non-approved template.
--   * This session's just-shipped simpler leads table/enums are dropped
--     below -- they were empty (no real data collected yet).

drop table if exists leads cascade;
drop type if exists lead_status;
drop type if exists lead_segment;
drop type if exists lead_source;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type lead_segment as enum ('new_mc', 'small_fleet', 'driver');
create type lead_status as enum (
  'new', 'enriched', 'qualified', 'disqualified', 'contacted', 'in_conversation',
  'onboarding', 'signed', 'lost', 'do_not_contact'
);
create type lead_rating as enum ('hot', 'warm', 'cold');

create type flag_severity as enum ('disqualifying', 'review', 'info');
create type flag_state as enum ('open', 'cleared', 'confirmed');
create type flag_origin as enum ('auto', 'manual');
create type score_status as enum ('pending', 'provisional', 'approved');

create type conv_channel as enum ('phone', 'sms', 'email', 'in_person', 'dat', 'social', 'other');
create type conv_direction as enum ('inbound', 'outbound', 'internal_note');

create type account_type as enum ('owner_operator', 'small_fleet', 'brokerage_carrier', 'individual');
create type contact_role as enum ('owner', 'driver', 'owner_driver', 'dispatcher', 'office', 'other');
create type phone_type as enum ('mobile', 'office', 'dispatch', '24hr', 'unknown');

create type campaign_type as enum ('lane', 'area_code', 'referral', 'job_board', 'event', 'other');
create type campaign_status as enum ('planned', 'active', 'paused', 'completed');
create type member_status as enum ('targeted', 'contacted', 'responded', 'converted', 'not_interested', 'removed');

create type onboarding_pathway as enum ('lease_on', 'company_driver', 'brokerage_carrier');
create type template_status as enum ('draft', 'approved', 'retired');
create type case_status as enum ('open', 'on_hold', 'cleared', 'withdrawn', 'rejected');
create type step_status as enum ('not_started', 'in_progress', 'complete', 'waived', 'failed');
create type roster_candidate_status as enum ('pending_reconciliation', 'added_to_roster', 'rejected');

create type task_status as enum ('open', 'completed', 'cancelled');
create type task_priority as enum ('high', 'normal', 'low');

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------
create table lead_sources (
  code text primary key,
  description text not null,
  active boolean not null default true
);
insert into lead_sources (code, description) values
  ('fmcsa_new_authority', 'Newly granted MC authority pulled from FMCSA'),
  ('fmcsa_lookup', 'Manual MC/DOT lookup via QCMobile'),
  ('referral', 'Referred by a current driver or owner-operator'),
  ('dat', 'DAT One contact'),
  ('tenstreet', 'Tenstreet application'),
  ('inbound_web', 'clgdelivers.com inbound form'),
  ('job_board', 'Job board posting'),
  ('manual', 'Entered manually');

create table vetting_flag_types (
  code text primary key,
  default_severity flag_severity not null,
  description text not null
);
insert into vetting_flag_types (code, default_severity, description) values
  ('EXCLUDED_ENTITY', 'disqualifying', 'Matches the CLG exclusion list'),
  ('NOT_ALLOWED_TO_OPERATE', 'disqualifying', 'FMCSA allowedToOperate = N'),
  ('OUT_OF_SERVICE_ORDER', 'disqualifying', 'Carrier has an active out-of-service date'),
  ('NO_ACTIVE_AUTHORITY', 'disqualifying', 'No active common or contract authority'),
  ('UNSATISFACTORY_RATING', 'disqualifying', 'FMCSA safety rating is Unsatisfactory'),
  ('INSURANCE_BELOW_REQUIRED', 'disqualifying', 'BIPD on file is below the required amount'),
  ('CONDITIONAL_RATING', 'review', 'FMCSA safety rating is Conditional'),
  ('FATAL_CRASH', 'review', 'One or more fatal crashes in the reporting window'),
  ('DRIVER_OOS_ABOVE_NATL', 'review', 'Driver OOS rate above national average'),
  ('VEHICLE_OOS_ABOVE_NATL', 'review', 'Vehicle OOS rate above national average'),
  ('MCS150_OUTDATED', 'review', 'MCS-150 biennial update is overdue'),
  ('FLEET_SIZE_OUT_OF_RANGE', 'review', 'Power units outside the configured range for the segment'),
  ('AUTHORITY_DATE_UNKNOWN', 'info', 'Authority grant date not available from current sources'),
  ('LOW_INSPECTION_HISTORY', 'info', 'Too few inspections for OOS rates to be meaningful');

create table excluded_entities (
  id uuid primary key default gen_random_uuid(),
  dot_number bigint,
  mc_number text,
  name_pattern text,
  reason text not null,
  created_at timestamptz not null default now(),
  check (dot_number is not null or mc_number is not null or name_pattern is not null)
);
insert into excluded_entities (name_pattern, reason) values
  ('%SILVER MOON%', 'Standing CLG rule: Silver Moon Transportation permanently excluded');
insert into excluded_entities (mc_number, reason) values
  ('873396', 'CLG Transportation itself'),
  ('881808', 'Capital Logistics Group itself (CLG brokerage)');

-- ---------------------------------------------------------------------------
-- FMCSA snapshots (append-only)
-- ---------------------------------------------------------------------------
create table carrier_snapshots (
  id uuid primary key default gen_random_uuid(),
  dot_number bigint not null,
  mc_number text,
  fetched_at timestamptz not null default now(),
  source text not null default 'qcmobile',

  legal_name text,
  dba_name text,
  phy_city text,
  phy_state text,

  allowed_to_operate boolean,
  oos_date date,
  common_authority_status text,
  contract_authority_status text,
  broker_authority_status text,

  authority_granted_date date,
  authority_date_source text,

  power_units integer,
  drivers integer,

  safety_rating text,
  safety_rating_date date,

  driver_inspections integer,
  driver_oos_inspections integer,
  driver_oos_rate numeric(6, 2),
  driver_oos_rate_natl numeric(6, 2),
  vehicle_inspections integer,
  vehicle_oos_inspections integer,
  vehicle_oos_rate numeric(6, 2),
  vehicle_oos_rate_natl numeric(6, 2),

  crash_total integer,
  fatal_crash integer,
  injury_crash integer,
  towaway_crash integer,

  bipd_on_file integer,
  bipd_required integer,
  cargo_on_file integer,
  mcs150_outdated boolean,

  raw jsonb not null
);
create index carrier_snapshots_dot_idx on carrier_snapshots (dot_number, fetched_at desc);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  segment lead_segment not null,
  status lead_status not null default 'new',
  source_code text not null references lead_sources(code),
  source_detail text,

  dot_number bigint,
  mc_number text,

  legal_name text,
  dba_name text,
  contact_name text,
  phone text,
  email text,
  city text,
  state text,

  authority_date_override date,
  authority_date_override_source text,

  latest_snapshot_id uuid references carrier_snapshots(id),

  fit_score numeric(5, 1),
  score_status score_status,
  score_coverage numeric(4, 3),
  score_version text,
  score_breakdown jsonb,
  scored_at timestamptz,

  disqualified_reason text,

  owner_id uuid references profiles(id),
  rating lead_rating,
  tier smallint check (tier between 1 and 4),
  tier_source text,
  converted_at timestamptz,
  converted_account_id uuid, -- FK added after accounts exists
  converted_contact_id uuid, -- FK added after contacts exists

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint carrier_segment_needs_id check (
    segment = 'driver' or dot_number is not null or mc_number is not null
  ),
  constraint mc_digits_only check (mc_number is null or mc_number ~ '^[0-9]+$'),
  constraint score_range check (fit_score is null or fit_score between 0 and 100),
  constraint authority_override_sourced check (
    authority_date_override is null or authority_date_override_source is not null
  )
);
create unique index leads_dot_unique on leads (dot_number) where dot_number is not null;
create unique index leads_mc_unique on leads (mc_number) where mc_number is not null;
create index leads_rank_idx on leads (segment, status, fit_score desc nulls last);

-- ---------------------------------------------------------------------------
-- Vetting flags
-- ---------------------------------------------------------------------------
create table lead_vetting_flags (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  flag_code text not null references vetting_flag_types(code),
  severity flag_severity not null,
  state flag_state not null default 'open',
  origin flag_origin not null default 'auto',
  detail text,
  snapshot_id uuid references carrier_snapshots(id),
  raised_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  constraint resolution_complete check (
    state = 'open' or (resolved_at is not null and resolved_by is not null)
  )
);
create unique index lead_flags_one_open on lead_vetting_flags (lead_id, flag_code) where state = 'open';

-- ---------------------------------------------------------------------------
-- Conversation log (append-only)
-- ---------------------------------------------------------------------------
create table lead_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid, -- FK added after contacts exists
  case_id uuid,     -- FK added after onboarding_cases exists
  occurred_at timestamptz not null default now(),
  channel conv_channel not null,
  direction conv_direction not null,
  author text not null,
  summary text not null,
  body text,
  next_step text,
  next_step_due date,
  corrects_id uuid references lead_conversations(id),
  created_at timestamptz not null default now(),
  constraint conversation_has_parent check (lead_id is not null or contact_id is not null or case_id is not null)
);
create index lead_conversations_lead_idx on lead_conversations (lead_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Status history (written by trigger)
-- ---------------------------------------------------------------------------
create table lead_status_history (
  id bigserial primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  from_status lead_status,
  to_status lead_status not null,
  changed_at timestamptz not null default now()
);
