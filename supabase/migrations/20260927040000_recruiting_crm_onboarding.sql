-- Owner-Operator Recruiting — CRM + governed onboarding
--
-- Adapted from the clg-recruiting Python build's db/001_init.sql +
-- db/002_crm_onboarding.sql (see RECRUITING.md and the spec doc it names).
-- Run 20260927030000_crm_roles.sql first -- this uses the role values it adds.
--
-- Adaptation decisions (see that migration's header for the role-enum one):
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
--     clear-to-dispatch gate below refuses to clear a case on a
--     non-approved template.
--   * This session's just-shipped simpler leads table/enums were dropped
--     in the previous migration in this same batch
--     (see 20260927030000_crm_roles.sql's sibling drop -- actually run as
--     part of this file below, since the drop doesn't touch the new enum
--     values and is safe to run alongside the rest of this file).

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

-- ---------------------------------------------------------------------------
-- Accounts and Contacts
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  account_type account_type not null,
  legal_name text not null,
  dba_name text,
  dot_number bigint unique,
  mc_number text unique check (mc_number is null or mc_number ~ '^[0-9]+$'),
  city text,
  state text,
  owner_id uuid references profiles(id),
  converted_from_lead_id uuid references leads(id),
  latest_snapshot_id uuid references carrier_snapshots(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  role contact_role not null default 'other',
  first_name text,
  last_name text,
  phone text,
  phone_kind phone_type not null default 'unknown',
  phone_source text,
  email text,
  home_zip text,
  area_code text,
  cdl_state text,
  sms_opt_in boolean,
  do_not_contact boolean not null default false,
  owner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_name is not null or last_name is not null or phone is not null)
);
create index contacts_account_idx on contacts (account_id);
create index contacts_phone_idx on contacts (phone);

alter table leads add constraint leads_converted_account_fk foreign key (converted_account_id) references accounts(id);
alter table leads add constraint leads_converted_contact_fk foreign key (converted_contact_id) references contacts(id);
alter table lead_conversations add constraint lead_conversations_contact_fk foreign key (contact_id) references contacts(id);

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  campaign_type campaign_type not null,
  status campaign_status not null default 'planned',
  lane_origin_zip3 text,
  lane_dest_zip3 text,
  lane_label text,
  target_area_codes text[],
  description text,
  owner_id uuid references profiles(id),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (campaign_type <> 'lane' or (lane_origin_zip3 is not null and lane_dest_zip3 is not null)),
  check (campaign_type <> 'area_code' or cardinality(target_area_codes) > 0)
);

create table campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  status member_status not null default 'targeted',
  tier smallint check (tier between 1 and 4),
  evidence text,
  added_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null)
);
create unique index campaign_member_lead on campaign_members (campaign_id, lead_id) where lead_id is not null;
create unique index campaign_member_contact on campaign_members (campaign_id, contact_id) where contact_id is not null;

-- ---------------------------------------------------------------------------
-- Onboarding templates (governed)
-- ---------------------------------------------------------------------------
create table onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  pathway onboarding_pathway not null,
  version text not null,
  status template_status not null default 'draft',
  approved_by text,
  approved_on date,
  notes text,
  created_at timestamptz not null default now(),
  unique (pathway, version),
  check (status <> 'approved' or (approved_by is not null and approved_on is not null))
);
create unique index one_approved_template_per_pathway on onboarding_templates (pathway) where status = 'approved';

create table onboarding_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references onboarding_templates(id) on delete cascade,
  step_code text not null,
  stage text not null,
  sequence smallint not null,
  name text not null,
  required boolean not null default true,
  owner_role user_role not null,
  requires_document boolean not null default false,
  document_expires boolean not null default false,
  reg_reference text,
  sla_days smallint,
  unique (template_id, step_code)
);

-- ---------------------------------------------------------------------------
-- Onboarding cases
-- ---------------------------------------------------------------------------
create table onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  pathway onboarding_pathway not null,
  template_id uuid not null references onboarding_templates(id),
  lead_id uuid references leads(id),
  account_id uuid references accounts(id),
  contact_id uuid references contacts(id),
  status case_status not null default 'open',
  current_stage text,
  owner_id uuid references profiles(id),
  target_start date,
  opened_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by text,
  closed_reason text,
  updated_at timestamptz not null default now(),
  check (contact_id is not null or account_id is not null),
  check (status <> 'cleared' or (cleared_at is not null and cleared_by is not null)),
  check (status not in ('withdrawn', 'rejected') or closed_reason is not null)
);
create index onboarding_cases_board on onboarding_cases (status, pathway, current_stage);

alter table lead_conversations add constraint lead_conversations_case_fk foreign key (case_id) references onboarding_cases(id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references onboarding_cases(id) on delete cascade,
  contact_id uuid references contacts(id),
  account_id uuid references accounts(id),
  doc_type text not null,
  storage_url text not null,
  issued_on date,
  expires_on date,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  verified_by text,
  verified_at timestamptz,
  check (case_id is not null or contact_id is not null or account_id is not null),
  check ((verified_by is null) = (verified_at is null))
);
create index documents_expiring on documents (expires_on) where expires_on is not null;

create table onboarding_case_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references onboarding_cases(id) on delete cascade,
  step_code text not null,
  stage text not null,
  sequence smallint not null,
  name text not null,
  required boolean not null,
  owner_role user_role not null,
  requires_document boolean not null,
  status step_status not null default 'not_started',
  assigned_to uuid references profiles(id),
  due_date date,
  completed_by text,
  completed_at timestamptz,
  document_id uuid references documents(id),
  waiver_reason text,
  waived_by text,
  notes text,
  unique (case_id, step_code),
  check (status <> 'complete' or (completed_by is not null and completed_at is not null)),
  check (status <> 'complete' or not requires_document or document_id is not null),
  check (status <> 'waived' or (waiver_reason is not null and waived_by is not null))
);

create table roster_candidates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references onboarding_cases(id),
  contact_id uuid references contacts(id),
  status roster_candidate_status not null default 'pending_reconciliation',
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  check (status = 'pending_reconciliation' or (decided_by is not null and decided_at is not null))
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  case_id uuid references onboarding_cases(id) on delete cascade,
  case_step_id uuid references onboarding_case_steps(id) on delete cascade,
  owner_id uuid references profiles(id),
  due_date date,
  priority task_priority not null default 'normal',
  status task_status not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null or case_id is not null),
  check (status <> 'completed' or completed_at is not null)
);
create index tasks_my_open on tasks (owner_id, due_date) where status = 'open';

-- ---------------------------------------------------------------------------
-- Field history
-- ---------------------------------------------------------------------------
create table field_history (
  id bigserial primary key,
  table_name text not null,
  record_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by text not null default coalesce(auth.email(), 'unknown'),
  changed_at timestamptz not null default now()
);
create index field_history_record on field_history (table_name, record_id, changed_at desc);

create function track_fields() returns trigger language plpgsql as $$
declare
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  foreach k in array tg_argv loop
    if o -> k is distinct from n -> k then
      insert into field_history (table_name, record_id, field, old_value, new_value, changed_by)
      values (tg_table_name, new.id, k, o ->> k, n ->> k, coalesce(auth.email(), 'unknown'));
    end if;
  end loop;
  return new;
end $$;

create trigger leads_history after update on leads for each row
  execute function track_fields('status', 'owner_id', 'rating', 'tier', 'segment', 'disqualified_reason');
create trigger contacts_history after update on contacts for each row
  execute function track_fields('phone', 'email', 'role', 'do_not_contact', 'sms_opt_in', 'owner_id');
create trigger cases_history after update on onboarding_cases for each row
  execute function track_fields('status', 'current_stage', 'owner_id', 'target_start', 'cleared_by');
create trigger case_steps_history after update on onboarding_case_steps for each row
  execute function track_fields('status', 'assigned_to', 'due_date', 'waived_by', 'document_id');

-- ---------------------------------------------------------------------------
-- Touch/append-only/status-log triggers
-- ---------------------------------------------------------------------------
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger leads_touch before update on leads for each row execute function touch_updated_at();
create trigger accounts_touch before update on accounts for each row execute function touch_updated_at();
create trigger contacts_touch before update on contacts for each row execute function touch_updated_at();
create trigger cases_touch before update on onboarding_cases for each row execute function touch_updated_at();

create function log_status_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into lead_status_history (lead_id, from_status, to_status)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status);
  end if;
  return new;
end $$;
create trigger leads_status_log after insert or update of status on leads for each row execute function log_status_change();

create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; insert a new row instead', tg_table_name;
end $$;
create trigger conversations_append_only before update or delete on lead_conversations for each row execute function forbid_mutation();
create trigger snapshots_append_only before update or delete on carrier_snapshots for each row execute function forbid_mutation();

-- ---------------------------------------------------------------------------
-- Exclusion, template match, clear-to-dispatch gate, roster candidate
-- ---------------------------------------------------------------------------
create function check_exclusion(p_dot bigint, p_mc text, p_name text)
returns text language sql stable as $$
  select reason from excluded_entities
  where (dot_number is not null and dot_number = p_dot)
     or (mc_number is not null and mc_number = p_mc)
     or (name_pattern is not null and p_name ilike name_pattern)
  limit 1
$$;

create function enforce_account_exclusion() returns trigger language plpgsql as $$
declare r text;
begin
  r := check_exclusion(new.dot_number, new.mc_number, new.legal_name);
  if r is null and new.dba_name is not null then
    r := check_exclusion(new.dot_number, new.mc_number, new.dba_name);
  end if;
  if r is not null then
    raise exception 'Excluded entity: %', r;
  end if;
  return new;
end $$;
create trigger accounts_exclusion before insert or update on accounts for each row execute function enforce_account_exclusion();

create function seed_case_steps() returns trigger language plpgsql as $$
begin
  insert into onboarding_case_steps (case_id, step_code, stage, sequence, name, required,
                                     owner_role, requires_document, due_date)
  select new.id, s.step_code, s.stage, s.sequence, s.name, s.required, s.owner_role,
         s.requires_document,
         case when s.sla_days is not null then (new.opened_at::date + s.sla_days) end
  from onboarding_template_steps s
  where s.template_id = new.template_id;
  return new;
end $$;
create trigger cases_seed_steps after insert on onboarding_cases for each row execute function seed_case_steps();

create function check_case_template() returns trigger language plpgsql as $$
begin
  if (select pathway from onboarding_templates where id = new.template_id) <> new.pathway then
    raise exception 'Template pathway does not match case pathway %', new.pathway;
  end if;
  return new;
end $$;
create trigger cases_template_match before insert or update of template_id, pathway on onboarding_cases
  for each row execute function check_case_template();

create function enforce_clear_gate() returns trigger language plpgsql as $$
declare
  open_steps text;
  tmpl_status template_status;
begin
  if new.status = 'cleared' and old.status is distinct from 'cleared' then
    select status into tmpl_status from onboarding_templates where id = new.template_id;
    if tmpl_status <> 'approved' then
      raise exception 'Cannot clear case: onboarding template is %, not approved', tmpl_status;
    end if;
    select string_agg(step_code, ', ' order by sequence) into open_steps
    from onboarding_case_steps
    where case_id = new.id and required and status not in ('complete', 'waived');
    if open_steps is not null then
      raise exception 'Cannot clear case: required steps incomplete: %', open_steps;
    end if;
  end if;
  return new;
end $$;
create trigger cases_clear_gate before update of status on onboarding_cases for each row execute function enforce_clear_gate();

create function create_roster_candidate() returns trigger language plpgsql as $$
begin
  if new.status = 'cleared' and old.status is distinct from 'cleared'
     and new.pathway in ('lease_on', 'company_driver') then
    insert into roster_candidates (case_id, contact_id) values (new.id, new.contact_id)
    on conflict (case_id) do nothing;
  end if;
  return new;
end $$;
create trigger cases_roster_candidate after update of status on onboarding_cases for each row execute function create_roster_candidate();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view ranked_leads as
select l.id, l.segment, l.status, l.legal_name, l.dot_number, l.mc_number,
       l.fit_score, l.score_status, l.score_coverage, l.scored_at,
       (select count(*) from lead_vetting_flags f
         where f.lead_id = l.id and f.state = 'open' and f.severity = 'review') as open_review_flags
from leads l
where l.status not in ('disqualified', 'lost', 'do_not_contact', 'signed')
order by l.segment, l.fit_score desc nulls last;

create view onboarding_board as
select c.id, c.pathway, c.status, c.current_stage, c.target_start, c.opened_at,
       coalesce(ct.first_name || ' ' || ct.last_name, ct.first_name, a.legal_name) as recruit,
       a.legal_name as account, u.full_name as owner,
       count(s.*) filter (where s.required) as required_steps,
       count(s.*) filter (where s.required and s.status in ('complete', 'waived')) as required_done,
       count(s.*) filter (where s.required and s.status not in ('complete', 'waived')
                                and s.due_date < current_date) as overdue_steps,
       t.status as template_status
from onboarding_cases c
left join contacts ct on ct.id = c.contact_id
left join accounts a on a.id = c.account_id
left join profiles u on u.id = c.owner_id
join onboarding_templates t on t.id = c.template_id
left join onboarding_case_steps s on s.case_id = c.id
group by c.id, ct.first_name, ct.last_name, a.legal_name, u.full_name, t.status;

create view expiring_documents as
select d.*, (d.expires_on - current_date) as days_left,
       case when d.expires_on < current_date then 'expired'
            when d.expires_on - current_date < 14 then 'red'
            when d.expires_on - current_date < 30 then 'yellow'
            else 'green' end as band
from documents d
where d.expires_on is not null;

create view campaign_funnel as
select c.id, c.name, c.campaign_type, c.status,
       count(m.*) as members,
       count(m.*) filter (where m.status in ('contacted', 'responded', 'converted')) as contacted,
       count(m.*) filter (where m.status in ('responded', 'converted')) as responded,
       count(m.*) filter (where m.status = 'converted') as converted
from campaigns c left join campaign_members m on m.campaign_id = c.id
group by c.id;

-- ---------------------------------------------------------------------------
-- Proposed onboarding templates (DRAFT -- Safety/HR/Finance must review and approve)
-- ---------------------------------------------------------------------------
with t as (
  insert into onboarding_templates (pathway, version, notes) values
  ('lease_on', '0.1-draft', 'Proposed by build. Regulatory references are starting points for Safety review, not a compliance determination.')
  returning id
)
insert into onboarding_template_steps (template_id, step_code, stage, sequence, name, required, owner_role, requires_document, document_expires, reg_reference, sla_days)
select t.id, v.* from t, (values
  ('APPLICATION', 'Application', 10, 'Employment application received', true, 'recruiter'::user_role, true, false, '49 CFR 391.21', 2),
  ('MVR', 'Qualification', 20, 'Motor vehicle record(s) obtained', true, 'safety'::user_role, true, false, '49 CFR 391.23(a)(1)', 5),
  ('CLEARINGHOUSE', 'Qualification', 30, 'Clearinghouse pre-employment full query', true, 'safety'::user_role, true, false, '49 CFR 382.701', 5),
  ('PREV_EMPLOYER', 'Qualification', 40, 'Previous DOT employer safety history (3 yrs)', true, 'safety'::user_role, true, false, '49 CFR 391.23', 30),
  ('DRUG_TEST', 'Qualification', 50, 'Pre-employment drug test, verified negative', true, 'safety'::user_role, true, false, '49 CFR 382.301', 7),
  ('MED_CERT', 'Qualification', 60, 'Medical examiner''s certificate on file', true, 'safety'::user_role, true, true, '49 CFR 391.41 / 391.43', 7),
  ('ROAD_TEST', 'Qualification', 70, 'Road test or accepted equivalent', true, 'safety'::user_role, true, false, '49 CFR 391.31 / 391.33', 10),
  ('PSP', 'Qualification', 80, 'PSP report reviewed (with driver consent)', false, 'safety'::user_role, true, false, 'FMCSA PSP program', 5),
  ('ANNUAL_INSPECTION', 'Equipment', 90, 'Tractor annual inspection current', true, 'safety'::user_role, true, true, '49 CFR 396.17', 10),
  ('EQUIP_RECEIPT', 'Equipment', 100, 'Equipment possession receipt', true, 'operations'::user_role, true, false, '49 CFR 376.11', 10),
  ('LEASE_AGREEMENT', 'Contract', 110, 'Signed lease agreement', true, 'operations'::user_role, true, false, '49 CFR 376.12', 10),
  ('INSURANCE', 'Contract', 120, 'Owner-operator insurance (NTL/bobtail, occ acc)', true, 'finance'::user_role, true, true, 'CLG policy', 10),
  ('W9_SETTLEMENT', 'Contract', 130, 'W-9 and settlement / pay setup', true, 'finance'::user_role, true, false, null, 10),
  ('SAMSARA', 'Systems', 140, 'Samsara ELD user and vehicle configured', true, 'operations'::user_role, false, false, '49 CFR 395 Subpart B', 12),
  ('ALVYS', 'Systems', 150, 'Alvys driver and tractor records created', true, 'operations'::user_role, false, false, null, 12),
  ('FUEL_CARD', 'Systems', 160, 'Fuel card issued', false, 'finance'::user_role, false, false, null, 12),
  ('ORIENTATION', 'Orientation', 170, 'Orientation and policy acknowledgments', true, 'operations'::user_role, true, false, 'CLG policy', 14),
  ('ROSTER_HANDOFF', 'Activation', 180, 'Roster candidate handed to Operations', true, 'operations'::user_role, false, false, 'Ops Dashboard Framework, D-01', 14)
) as v(step_code, stage, sequence, name, required, owner_role, requires_document, document_expires, reg_reference, sla_days);

with t as (
  insert into onboarding_templates (pathway, version, notes) values
  ('company_driver', '0.1-draft', 'Proposed by build. Safety and HR review required.')
  returning id
)
insert into onboarding_template_steps (template_id, step_code, stage, sequence, name, required, owner_role, requires_document, document_expires, reg_reference, sla_days)
select t.id, v.* from t, (values
  ('APPLICATION', 'Application', 10, 'Employment application received', true, 'recruiter'::user_role, true, false, '49 CFR 391.21', 2),
  ('MVR', 'Qualification', 20, 'Motor vehicle record(s) obtained', true, 'safety'::user_role, true, false, '49 CFR 391.23(a)(1)', 5),
  ('CLEARINGHOUSE', 'Qualification', 30, 'Clearinghouse pre-employment full query', true, 'safety'::user_role, true, false, '49 CFR 382.701', 5),
  ('PREV_EMPLOYER', 'Qualification', 40, 'Previous DOT employer safety history (3 yrs)', true, 'safety'::user_role, true, false, '49 CFR 391.23', 30),
  ('DRUG_TEST', 'Qualification', 50, 'Pre-employment drug test, verified negative', true, 'safety'::user_role, true, false, '49 CFR 382.301', 7),
  ('MED_CERT', 'Qualification', 60, 'Medical examiner''s certificate on file', true, 'safety'::user_role, true, true, '49 CFR 391.41 / 391.43', 7),
  ('ROAD_TEST', 'Qualification', 70, 'Road test or accepted equivalent', true, 'safety'::user_role, true, false, '49 CFR 391.31 / 391.33', 10),
  ('HR_FORMS', 'Contract', 80, 'I-9, W-4, and offer letter', true, 'admin'::user_role, true, false, 'HR', 7),
  ('SAMSARA', 'Systems', 90, 'Samsara ELD user configured', true, 'operations'::user_role, false, false, null, 10),
  ('ALVYS', 'Systems', 100, 'Alvys driver record created', true, 'operations'::user_role, false, false, null, 10),
  ('ORIENTATION', 'Orientation', 110, 'Orientation and policy acknowledgments', true, 'operations'::user_role, true, false, 'CLG policy', 12),
  ('ROSTER_HANDOFF', 'Activation', 120, 'Roster candidate handed to Operations', true, 'operations'::user_role, false, false, 'Ops Dashboard Framework, D-01', 12)
) as v(step_code, stage, sequence, name, required, owner_role, requires_document, document_expires, reg_reference, sla_days);

with t as (
  insert into onboarding_templates (pathway, version, notes) values
  ('brokerage_carrier', '0.1-draft', 'Carrier setup for Capital Logistics Group. Brokerage ops review required.')
  returning id
)
insert into onboarding_template_steps (template_id, step_code, stage, sequence, name, required, owner_role, requires_document, document_expires, reg_reference, sla_days)
select t.id, v.* from t, (values
  ('FMCSA_CHECK', 'Qualification', 10, 'Active authority and safety check (FMCSA pull)', true, 'recruiter'::user_role, false, false, 'QCMobile snapshot', 1),
  ('COI', 'Contract', 20, 'Certificate of insurance, CLG as holder', true, 'finance'::user_role, true, true, 'Broker-carrier agreement', 3),
  ('W9', 'Contract', 30, 'W-9 on file', true, 'finance'::user_role, true, false, null, 3),
  ('BCA', 'Contract', 40, 'Signed broker-carrier agreement', true, 'operations'::user_role, true, false, null, 3),
  ('ALJEX_SETUP', 'Systems', 50, 'Carrier profile created in Aljex', true, 'operations'::user_role, false, false, null, 5),
  ('PAYMENT_SETUP', 'Systems', 60, 'Remit-to and payment method set up', true, 'finance'::user_role, false, false, null, 5)
) as v(step_code, stage, sequence, name, required, owner_role, requires_document, document_expires, reg_reference, sla_days);

-- ---------------------------------------------------------------------------
-- RLS -- broad "authenticated" policy on every table, matching every other
-- table in this app. Fine-grained per-role RLS is Phase 2, not solved here.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'lead_sources', 'vetting_flag_types', 'excluded_entities', 'carrier_snapshots',
    'leads', 'lead_vetting_flags', 'lead_conversations', 'lead_status_history',
    'accounts', 'contacts', 'campaigns', 'campaign_members',
    'onboarding_templates', 'onboarding_template_steps', 'onboarding_cases',
    'documents', 'onboarding_case_steps', 'roster_candidates', 'tasks', 'field_history'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      'authenticated_all_' || t, t
    );
  end loop;
end $$;
