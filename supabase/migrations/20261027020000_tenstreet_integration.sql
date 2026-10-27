-- Owner-Operator Recruiting — Tenstreet inbound listener
--
-- Background: RECRUITING.md section 4 originally said "sensitive DQF
-- content (SSN, medical cert, drug test, license image) stays in
-- Tenstreet only — CLG OS links out by reference, never stores it," and
-- section 8's guardrail said "never pull [background checks] from this
-- system." Both were written assuming CLG OS would only ever query OUT to
-- Tenstreet. They predate Tenstreet's actual API shape: Tenstreet PUSHES
-- application/document data to an HTTPS endpoint CLG provides, triggered
-- by their own dashboard, not something we request. 2026-10-27 decision
-- (see RECRUITING.md's updated section 4/8): CLG wants this data pulled in
-- fully rather than left as a link-out, so this migration adds storage for
-- it -- encrypted, and gated to the recruiter/admin roles specifically
-- (tighter than the broad "authenticated" RLS every other recruiting table
-- uses), since every other recruiting table is readable by any logged-in
-- user and this is materially more sensitive (SSNs, MVR/PSP background
-- check files).
--
-- 'tenstreet' already exists as a lead_sources.code
-- (20260927040000_recruiting_leads_vetting.sql) -- no enum/lookup change
-- needed there, a Tenstreet-sourced applicant is just another leads row.
--
-- Encryption: pgcrypto's pgp_sym_encrypt/decrypt, keyed by a passphrase
-- that lives ONLY in Edge Function secrets (TENSTREET_ENCRYPTION_KEY),
-- passed in at call time by the edge function -- never stored in the
-- database itself, per the "secrets in Edge Function secrets only" PII
-- guardrail (RECRUITING.md section 8).
--
-- The encrypt+insert for each table happens inside one plpgsql function
-- (below) rather than the edge function encrypting client-side and then
-- inserting the resulting bytea -- a bytea value doesn't round-trip
-- reliably through the JS client's JSON encoding, so the encryption has
-- to happen on this side of that boundary, not before it.
create extension if not exists pgcrypto;

create or replace function tenstreet_decrypt(ciphertext bytea, key text)
returns text language sql as $$ select pgp_sym_decrypt(ciphertext, key) $$;

-- A Tenstreet-sourced lead carries which environment (DEV/PROD) posted it
-- -- Tenstreet's own test posts during setup/validation land in this same
-- table (this app has no separate staging backend to isolate them in), so
-- this lets a future "hide test leads" filter exist without another
-- migration. Null for every non-Tenstreet lead.
alter table leads add column source_mode text;

-- ---------------------------------------------------------------------------
-- Append-only inbound audit log -- one row per POST, per the handover doc's
-- "Logging and retention" requirement (keep >= 366 days, searchable by
-- FileId/CompanyId/time range, proof of what arrived + exactly what we
-- replied, without copying PII into a plain log).
-- ---------------------------------------------------------------------------
create table tenstreet_inbound_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  route text not null check (route in ('application', 'documents')),
  source_ip text,
  mode text,
  company_id text,
  file_id text,
  lead_id uuid references leads(id) on delete set null,
  payload_hash text not null,
  raw_xml_encrypted bytea not null,
  http_status integer not null,
  response_status text not null,
  response_description text not null,
  processing_outcome text not null,
  processing_duration_ms integer
);
create index idx_tenstreet_inbound_log_company_id on tenstreet_inbound_log(company_id);
create index idx_tenstreet_inbound_log_file_id on tenstreet_inbound_log(file_id);
create index idx_tenstreet_inbound_log_received_at on tenstreet_inbound_log(received_at);

alter table tenstreet_inbound_log enable row level security;
create policy "recruiter_admin_select_tenstreet_inbound_log" on tenstreet_inbound_log for select
  using (exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')));
-- No insert/update/delete policy for ordinary users -- this table is
-- written only by the edge functions via the service-role key, which
-- bypasses RLS entirely. It's append-only by design: nothing in the app
-- should ever update or delete a row here.

-- Called by both edge functions with the raw XML as plaintext -- computes
-- the payload hash and encrypts it server-side, in the same statement as
-- the insert.
create or replace function tenstreet_log_inbound(
  p_route text, p_source_ip text, p_mode text, p_company_id text, p_file_id text, p_lead_id uuid,
  p_raw_xml text, p_http_status integer, p_response_status text, p_response_description text,
  p_processing_outcome text, p_processing_duration_ms integer, p_key text
) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into tenstreet_inbound_log (
    route, source_ip, mode, company_id, file_id, lead_id, payload_hash, raw_xml_encrypted,
    http_status, response_status, response_description, processing_outcome, processing_duration_ms
  ) values (
    p_route, p_source_ip, p_mode, p_company_id, p_file_id, p_lead_id,
    encode(digest(p_raw_xml, 'sha256'), 'hex'), pgp_sym_encrypt(p_raw_xml, p_key),
    p_http_status, p_response_status, p_response_description, p_processing_outcome, p_processing_duration_ms
  ) returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Application feed -- one row per applicant, 1:1 with the leads row it
-- creates/updates. Holds the SSN (encrypted + a plaintext last-4 for
-- lookups/display, so the plaintext full number is never the search key)
-- and the full parsed ApplicationData/PersonalData/CustomDataElements tree
-- as jsonb, since the exact schema is still provisional (Tenstreet's own
-- guides don't include real sample XML) and "pull in as much data as
-- possible" was the explicit direction -- better to keep everything we
-- parsed than to guess which fields matter and drop the rest.
-- ---------------------------------------------------------------------------
create table tenstreet_applicant_identity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id) on delete cascade,
  tenstreet_company_id text,
  ssn_encrypted bytea,
  ssn_last4 text,
  raw_application jsonb not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tenstreet_applicant_identity_ssn_last4 on tenstreet_applicant_identity(ssn_last4);

alter table tenstreet_applicant_identity enable row level security;
create policy "recruiter_admin_all_tenstreet_applicant_identity" on tenstreet_applicant_identity for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')));

-- p_ssn is the plaintext SSN (or null) -- encrypted, and its last 4 digits
-- extracted, server-side. One applicant identity row per lead (upsert on
-- lead_id), since a Tenstreet applicant updating/re-submitting an
-- application should update this record, not create a second one.
create or replace function tenstreet_upsert_applicant_identity(
  p_lead_id uuid, p_company_id text, p_ssn text, p_raw_application jsonb, p_key text
) returns void language plpgsql as $$
begin
  insert into tenstreet_applicant_identity (lead_id, tenstreet_company_id, ssn_encrypted, ssn_last4, raw_application, updated_at)
  values (
    p_lead_id, p_company_id,
    case when p_ssn is not null then pgp_sym_encrypt(p_ssn, p_key) else null end,
    case when p_ssn is not null then right(regexp_replace(p_ssn, '\D', '', 'g'), 4) else null end,
    p_raw_application, now()
  )
  on conflict (lead_id) do update set
    tenstreet_company_id = excluded.tenstreet_company_id,
    ssn_encrypted = excluded.ssn_encrypted,
    ssn_last4 = excluded.ssn_last4,
    raw_application = excluded.raw_application,
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Documents feed -- one row per file (MVR, PSP, Certificate of Compliance,
-- etc). Matched to a lead by ssn_last4 when exactly one candidate matches;
-- left unmatched (lead_id null) otherwise for a recruiter to link by hand
-- later rather than guessing. Unique on (tenstreet_file_id,
-- tenstreet_company_id) is this feed's idempotency key (the handover doc's
-- own suggestion, since Tenstreet may re-post) -- a repeat post updates the
-- existing row instead of creating a duplicate.
-- ---------------------------------------------------------------------------
create table tenstreet_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  tenstreet_company_id text,
  tenstreet_file_id text,
  ssn_encrypted bytea,
  ssn_last4 text,
  file_code text,
  file_category_name text,
  filename text,
  file_type text,
  file_size integer,
  date_created date,
  file_expiration date,
  storage_path text not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenstreet_file_id, tenstreet_company_id)
);
create index idx_tenstreet_documents_ssn_last4 on tenstreet_documents(ssn_last4);
create index idx_tenstreet_documents_lead_id on tenstreet_documents(lead_id);

alter table tenstreet_documents enable row level security;
create policy "recruiter_admin_all_tenstreet_documents" on tenstreet_documents for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')));

-- p_ssn is the plaintext SSN (or null) -- encrypted, and its last 4 digits
-- extracted, server-side, same as the applicant-identity function above.
-- Upserts on (tenstreet_file_id, tenstreet_company_id), this feed's
-- idempotency key, per the handover doc's own suggestion (Tenstreet may
-- re-post the same file).
create or replace function tenstreet_upsert_document(
  p_lead_id uuid, p_company_id text, p_file_id text, p_ssn text,
  p_file_code text, p_file_category_name text, p_filename text, p_file_type text, p_file_size integer,
  p_date_created date, p_file_expiration date, p_storage_path text, p_key text
) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into tenstreet_documents (
    lead_id, tenstreet_company_id, tenstreet_file_id, ssn_encrypted, ssn_last4,
    file_code, file_category_name, filename, file_type, file_size, date_created, file_expiration, storage_path, updated_at
  ) values (
    p_lead_id, p_company_id, p_file_id,
    case when p_ssn is not null then pgp_sym_encrypt(p_ssn, p_key) else null end,
    case when p_ssn is not null then right(regexp_replace(p_ssn, '\D', '', 'g'), 4) else null end,
    p_file_code, p_file_category_name, p_filename, p_file_type, p_file_size, p_date_created, p_file_expiration, p_storage_path, now()
  )
  on conflict (tenstreet_file_id, tenstreet_company_id) do update set
    lead_id = excluded.lead_id, ssn_encrypted = excluded.ssn_encrypted, ssn_last4 = excluded.ssn_last4,
    file_code = excluded.file_code, file_category_name = excluded.file_category_name, filename = excluded.filename,
    file_type = excluded.file_type, file_size = excluded.file_size, date_created = excluded.date_created,
    file_expiration = excluded.file_expiration, storage_path = excluded.storage_path, updated_at = now()
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket for the actual files -- private, and (unlike every other
-- bucket in this app, e.g. 'invoices'/'unit-documents') gated to
-- recruiter/admin specifically rather than any authenticated user, since
-- these are background-check files. Uploaded only by the edge function via
-- the service-role key (bypasses these policies for the insert path);
-- these policies govern a human recruiter/admin viewing or removing one
-- through the app later.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tenstreet-documents', 'tenstreet-documents', false)
on conflict (id) do nothing;

create policy "recruiter_admin_read_tenstreet_documents" on storage.objects for select
  using (bucket_id = 'tenstreet-documents' and exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')));

create policy "recruiter_admin_delete_tenstreet_documents" on storage.objects for delete
  using (bucket_id = 'tenstreet-documents' and exists (select 1 from profiles where id = auth.uid() and role in ('recruiter', 'admin')));
