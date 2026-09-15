-- Fleet Maintenance System — tractor assignment/return inspection
-- (2026-09-16)
--
-- A mechanic-run digital replacement for the paper tractor
-- assignment/return inspection form: equipment on the tractor, a
-- walkaround, fire extinguisher, fluid levels, the required-documents
-- binder, defects/cleanliness notes, and driver + CLG signatures.
-- Separate and manual, not connected to the existing Samsara-synced
-- dvir_defects table -- that's the DOT-mandated electronic DVIR, this is
-- CLG's own equipment-condition checklist at hand-off, a different
-- purpose (confirmed with CLG 2026-09-16).
--
-- Every yes/no and ok/needs-attention field is stored as a boolean where
-- true = good (Yes / OK) and false = a problem (No / Needs attention) --
-- one consistent polarity so "false" uniformly means "raises a work
-- order on filing" regardless of which button labels the source design
-- used for a given row.
--
-- status starts 'draft' (the form's "Save as draft" action) and moves to
-- 'filed' once submitted -- filing is what raises work orders for any
-- false equipment/walkaround/document field, via the app layer (not a
-- trigger, so the created work orders' categories/descriptions can use
-- the same human-readable mapping the frontend already shows).

create table tractor_inspections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete restrict,
  status text not null default 'draft', -- 'draft' | 'filed'
  inspection_type text not null default 'assignment', -- 'assignment' | 'return'
  inspected_at date not null default current_date,

  driver_name text,
  odometer integer,
  tag_plate text,
  smoker boolean,

  -- Equipment on the tractor
  prepass_transponder boolean,
  prepass_transponder_number text,
  current_ifta_decal boolean,
  loves_rfid boolean,
  loves_rfid_number text,
  eld_dashcam_cables boolean,
  warning_triangles boolean,
  kingpin_lock_key boolean,
  circle_lock_key boolean,
  cell_tablet_mount boolean,
  inverter boolean,
  refrigerator boolean,
  apu boolean,
  kill_switch boolean,
  kill_switch_location text,
  mattress_condition text,

  -- Walkaround
  fifth_wheel_plate boolean,
  airlines boolean,
  tires_lugs_hubs boolean,
  all_lights_work boolean,
  reflective_ls boolean,

  -- Fire extinguisher
  fire_ext_present boolean,
  fire_ext_charge_level text,
  fire_ext_secured boolean,
  fire_ext_location text,

  -- Fluid levels (free text -- source readings are things like "7/8",
  -- "Full", "Not recorded", not a clean numeric scale)
  fuel_level text,
  coolant_level text,
  oil_level text,
  wiper_fluid_level text,
  brake_fluid_level text,

  -- Binder — required documents
  registration_doc boolean,
  insurance_doc boolean,
  annual_inspection_doc boolean,
  ifta_license_doc boolean,
  blank_logs_doc boolean,
  eld_driver_guide_doc boolean,
  eld_dot_card_doc boolean,
  eld_malfunction_instructions_doc boolean,
  lease_agreement_doc boolean,

  -- Defects & cleanliness
  cab_notes text,
  exterior_notes text,
  damage_defects_notes text,

  -- Signatures
  driver_signature_name text,
  driver_signed_at timestamptz,
  clg_signature_name text,
  clg_signed_at timestamptz,

  -- Company use (not shown to the driver)
  correction_dates text,
  filed_by text,
  filed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tractor_inspections_unit_id on tractor_inspections(unit_id);
create index idx_tractor_inspections_status on tractor_inspections(status);

-- Traceability: a work order raised from a failed inspection item links
-- back to the inspection that raised it, same provenance pattern as
-- alvys_maintenance_id/samsara_reference_id.
alter table work_orders add column if not exists tractor_inspection_id uuid references tractor_inspections(id) on delete set null;

alter table tractor_inspections enable row level security;
create policy "authenticated_all_tractor_inspections" on tractor_inspections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
