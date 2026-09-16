-- Fleet Maintenance System — annual PM safety check inspections
-- (2026-09-18)
--
-- Digital replacement for CLG's paper "PM Safety Check" forms (uploaded
-- 2026-09-18) -- a mechanic-run periodic mechanical/safety inspection,
-- separate from and unrelated to both tractor_inspections (the
-- driver/CLG assignment-and-return equipment checklist) and dvir_defects
-- (the DOT-mandated electronic DVIR fed by Samsara). One shared table
-- covers both the tractor and trailer variants -- the two paper forms
-- overlap heavily in shape (a checklist, a tire/brake measurement grid,
-- a mechanic sign-off) but differ enough in their actual items (tractor:
-- walkaround + under-hood/under-truck + fifth wheel + PM mileage
-- interval; trailer: ABS/brake system + suspension + coupling/locking/
-- slider + frame & body + electrical + landing gear, each as one
-- OK/Defect-Repaired row per category rather than one row per part) that
-- forcing them into per-item boolean columns would mean dozens of
-- columns that are always null for one vehicle type or the other.
-- unit_type is captured at creation (not joined live from `units`) so a
-- filed inspection's shape never changes retroactively if the unit
-- record is edited later.
--
-- Explicitly does NOT raise work orders on filing (per CLG, 2026-09-18)
-- -- unlike tractor_inspections, this just records pass/fail/defect
-- state and a mechanic sign-off; a human opens a work order separately
-- for anything that needs it. That's also why this doesn't need
-- per-item boolean columns for a "scan for false" pass the way
-- tractor_inspections does -- see tractorInspectionItems.js/
-- TractorInspectionForm.jsx for that pattern.
--
-- Annual vs. Mid-Trip: only "Annual" ships now, using the checklist from
-- the two uploaded PMSC forms. "Mid-Trip" (CLG confirmed 2026-09-18 it's
-- a materially different, shorter checklist, not just the same form
-- tagged differently) is a deliberate follow-up -- inspection_occasion
-- is added now so it doesn't require a second migration once that
-- content exists, but only 'annual' is used today.

create table annual_inspections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete restrict,
  unit_type unit_type not null,
  inspection_occasion text not null default 'annual', -- 'annual' | 'mid_trip' (mid_trip not yet implemented)
  status text not null default 'draft', -- 'draft' | 'filed'
  inspected_at date not null default current_date,

  -- Tractor-only header fields
  driver_name text,
  mileage integer,
  vin text,
  pm_service_level text, -- 'A' | 'AF' | 'B' -- tractor's PM mileage-interval tier
  overall_result text, -- 'Pass' | 'Fail' -- tractor form's own top box

  -- Trailer-only header fields
  trailer_year text,
  trailer_make text,
  abs_equipped boolean, -- trailer form's "ABS Yes/No" brake-system sub-field

  -- Shared checklist -- one shape covers the tractor's per-part OK/Fail
  -- rows and the trailer's per-category OK/Defect-Repaired rows. See
  -- web/src/lib/annualInspectionItems.js for the fixed item list each
  -- vehicle type renders.
  -- Shape: [{ key, section, label, status: 'ok'|'fail'|'defect_repaired'|null, note }]
  checklist jsonb not null default '[]'::jsonb,

  -- Tire tread/pressure (tractor, by wheel position) or tread depth
  -- (trailer, by axle position) grid.
  -- Shape: [{ position, ok, value }]
  tire_grid jsonb not null default '[]'::jsonb,

  -- Brake pad + adjustment measurement (tractor) or brake lining
  -- measurement (trailer), by wheel position.
  -- Shape: [{ position, pad_measurement, adjustment_measurement, ok }]
  brake_grid jsonb not null default '[]'::jsonb,

  -- Certification line (tractor form's own sign-off text)
  failed_items_repaired boolean,
  reinspected_and_passed boolean,
  reinspection_date date,

  -- Trailer-only free text -- "Defective repair/replacement details"
  defect_repair_details text,

  -- Mechanic sign-off (both forms)
  mechanic_name text,
  mechanic_signature_data text, -- drawn signature, base64 PNG data URL -- same pattern as tractor_inspections
  mechanic_signed_at timestamptz,

  -- Service facility (tractor form's own footer -- defaults to CLG's own
  -- shop, editable for an interim/on-the-road inspection at a
  -- third-party facility)
  service_facility_name text,
  service_facility_address text,
  service_facility_phone text,

  filed_by text,
  filed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_annual_inspections_unit_id on annual_inspections(unit_id);
create index idx_annual_inspections_status on annual_inspections(status);

alter table annual_inspections enable row level security;
create policy "authenticated_all_annual_inspections" on annual_inspections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
