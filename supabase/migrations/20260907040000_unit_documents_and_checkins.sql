-- Fleet Maintenance System — unit documents/photos + driver check-in/out log
--
-- Units page redesign, phase 1 (data model), continued. Two new pieces:
--
-- 1. unit_documents: general-purpose file attachment for a unit — unit
--    photos, registration, title, insurance card, lease agreement, or a
--    photo taken during a driver check-in/out (checkin_id links back to
--    the event it was captured for; null for a standalone document).
--    Mirrors the only existing storage pattern in the app (the `invoices`
--    bucket added for work-order receipts, 20260827000000) — a private
--    bucket, a random-prefixed storage path, read via signed URL, no
--    public access.
--
-- 2. unit_checkins: a dispatcher/mechanic-logged event each time a driver
--    drops off or picks up a unit — odometer/fuel/condition captured at
--    that moment, not just whenever someone happens to update the unit's
--    running odometer field. driver_name is free text (not a drivers.id
--    FK) — same tradeoff driver_roster already made: a fast, low-friction
--    log beats a hard dependency on the driver already existing in the
--    synced `drivers` table.

create table if not exists unit_documents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  checkin_id uuid, -- set when this file was captured as part of a check-in/out event (FK added below, after unit_checkins exists)
  doc_type text not null check (doc_type in ('photo', 'registration', 'title', 'insurance_card', 'lease_agreement', 'checkin_photo', 'other')),
  storage_path text not null,
  file_name text,
  note text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists unit_checkins (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  event_type text not null check (event_type in ('check_in', 'check_out')),
  driver_name text,
  occurred_at timestamptz not null default now(),
  odometer integer,
  fuel_percent numeric(5, 2),
  condition_notes text,
  logged_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table unit_documents add constraint unit_documents_checkin_id_fkey
  foreign key (checkin_id) references unit_checkins(id) on delete set null;

create index if not exists idx_unit_documents_unit_id on unit_documents(unit_id);
create index if not exists idx_unit_documents_checkin_id on unit_documents(checkin_id);
create index if not exists idx_unit_checkins_unit_id on unit_checkins(unit_id);
create index if not exists idx_unit_checkins_occurred_at on unit_checkins(occurred_at);

alter table unit_documents enable row level security;
alter table unit_checkins enable row level security;

create policy "authenticated_all_unit_documents" on unit_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_unit_checkins" on unit_checkins
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('unit-documents', 'unit-documents', false)
on conflict (id) do nothing;

create policy "authenticated_read_unit_documents" on storage.objects for select
  using (bucket_id = 'unit-documents' and auth.role() = 'authenticated');
create policy "authenticated_upload_unit_documents" on storage.objects for insert
  with check (bucket_id = 'unit-documents' and auth.role() = 'authenticated');
create policy "authenticated_delete_unit_documents" on storage.objects for delete
  using (bucket_id = 'unit-documents' and auth.role() = 'authenticated');
