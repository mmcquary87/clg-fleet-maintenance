-- Fleet Maintenance System — tractor inspection photos + drawn signatures
-- (2026-09-17)
--
-- Two changes to the tractor assignment/return inspection, per CLG:
--
-- 1. Photo capture (live camera or an uploaded file), same general-purpose
--    unit_documents table checkin photos already use -- extends doc_type
--    and adds tractor_inspection_id so a photo can link back to the
--    inspection it was taken for. Covers both the "Mount for cell/tablet
--    requires a photo" item from the source design and a general photo
--    area for the inspection as a whole.
--
-- 2. A drawn signature, not a typed name. The existing
--    driver_signature_name/clg_signature_name text columns stay (the
--    printed name alongside the signature, same as a paper form) --
--    these new columns hold the actual drawn ink as a base64 PNG data
--    URL, small enough that a plain text column is simpler than routing
--    through the storage bucket + signed URL machinery photos need.

do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'unit_documents'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%doc_type%';
  if con is not null then
    execute format('alter table unit_documents drop constraint %I', con);
  end if;
end $$;

alter table unit_documents add constraint unit_documents_doc_type_check
  check (doc_type in ('photo', 'registration', 'title', 'insurance_card', 'lease_agreement', 'checkin_photo', 'tractor_inspection_photo', 'other'));

alter table unit_documents add column if not exists tractor_inspection_id uuid references tractor_inspections(id) on delete cascade;
create index if not exists idx_unit_documents_tractor_inspection_id on unit_documents(tractor_inspection_id);

alter table tractor_inspections add column if not exists driver_signature_data text;
alter table tractor_inspections add column if not exists clg_signature_data text;
