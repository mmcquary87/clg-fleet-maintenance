-- Owner-Operator Recruiting — CRM + governed onboarding (part 3 of 3: governance)
--
-- Run AFTER 20260927040000_recruiting_leads_vetting.sql and
-- 20260927040100_recruiting_crm_entities.sql. See the part-1 file's header
-- for why this migration is split into three parts and the overall run
-- order.
--
-- field_history, touch/append-only/status-log triggers, exclusion
-- enforcement, template match + clear-to-dispatch gate + roster-candidate
-- triggers, views, DRAFT onboarding templates (nothing approved), and RLS.

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
