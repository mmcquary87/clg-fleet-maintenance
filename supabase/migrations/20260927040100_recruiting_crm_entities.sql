-- Owner-Operator Recruiting — CRM + governed onboarding (part 2 of 3: CRM entities)
--
-- Run AFTER 20260927040000_recruiting_leads_vetting.sql (this references
-- leads/carrier_snapshots/profiles created there). See that file's header
-- for why this migration is split into three parts and the overall run
-- order.
--
-- Accounts/Contacts, Campaigns, Onboarding templates, Onboarding cases +
-- documents + case steps + roster_candidates, Tasks.

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
