-- Fleet Maintenance System — mechanic-facing Annual (DOT) Inspection filing.
--
-- Until now, Annual Inspection was a compliance-tracking surface only
-- (AnnualInspectionComplianceView reads units.last_annual_inspection_date,
-- see maintenanceSchedule.js's ANNUAL_INSPECTION_INTERVAL_DAYS) -- nothing
-- let a mechanic actually file one. This table is that filing record,
-- modeled on tractor_inspections (20260916020000) but covering both truck
-- tractors and trailers, so a single checklist item set doesn't fit one
-- fixed set of columns: item_results is keyed by the item keys defined in
-- web/src/lib/annualInspectionItems.js, which differ by unit_type.

create table annual_inspections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete restrict,
  unit_type unit_type not null, -- captured at inspection time, same reasoning as mid_trip_inspections.unit_type
  status text not null default 'draft', -- 'draft' | 'filed'
  inspected_at date not null default current_date,
  odometer integer,

  -- { [item_key]: boolean } -- true = OK, false = defect. Item set depends
  -- on unit_type (see TRACTOR_ITEMS / TRAILER_ITEMS in annualInspectionItems.js).
  item_results jsonb not null default '{}'::jsonb,
  notes text,

  inspector_name text,
  inspector_signature_name text,
  inspector_signature_data text,
  inspector_signed_at timestamptz,
  -- Required before filing -- the 49 CFR 396.17/Appendix A certification
  -- that the inspection met the minimum periodic inspection standards.
  certification_statement_accepted boolean not null default false,

  filed_by text,
  filed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_annual_inspections_unit_id on annual_inspections(unit_id);
create index idx_annual_inspections_status on annual_inspections(status);

-- Traceability FK onto work_orders, same pattern as tractor_inspection_id.
alter table work_orders add column if not exists annual_inspection_id uuid references annual_inspections(id) on delete set null;

alter table annual_inspections enable row level security;
create policy "authenticated_all_annual_inspections" on annual_inspections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Photos attached to a filed annual inspection, same pattern as
-- tractor_inspection_photo (20260917010000).
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
  check (doc_type in ('photo', 'registration', 'title', 'insurance_card', 'lease_agreement', 'checkin_photo', 'tractor_inspection_photo', 'annual_inspection_photo', 'other'));

alter table unit_documents add column if not exists annual_inspection_id uuid references annual_inspections(id) on delete cascade;
create index if not exists idx_unit_documents_annual_inspection_id on unit_documents(annual_inspection_id);
