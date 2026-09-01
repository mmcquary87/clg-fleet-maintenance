-- Fleet Maintenance System — Preventive/Scheduled Maintenance forecast
--
-- Two independent sources feed this, per CLG's direction (2026-09-01):
--
-- 1. Oil Change (distance-based) -- CLG has real intervals configured in
--    Samsara's own PM dashboard, split by engine make (Freightliner/Volvo/
--    Mack) plus separate Penske-leased variants (confirmed via a schedule
--    export). Samsara's own due-date math is NOT used, though -- every Oil
--    Change instance in CLG's account has a blank "Last serviced at," so
--    Samsara's target odometer is a stale one-time baseline, not real
--    service history (some units showed >90,000 mi "overdue," not
--    credible for a truck still in service). Instead this app estimates
--    its own due date from units.last_pm_date (already set whenever a PM/
--    Oil work order closes here) plus a real trailing mileage rate (same
--    distanceTraveledMeters-based method samsara-miles/samsara-fleet-mpg
--    already use) -- see unit_maintenance_due.basis below.
--
-- 2. Annual DOT Inspection (date-based) -- sourced from Alvys instead of
--    Samsara: GET trucks/{id}/documents (confirmed working 2026-09-01)
--    returns each unit's uploaded documents, and the actual inspection
--    certificate's real expiration date is embedded in its free-text
--    AttachmentType label (e.g. "DOT annual inspection expires
--    7/17/2027") -- there's no dedicated expiration-date field. No
--    interval/schedule concept is needed for this source at all: the real
--    due date comes straight off the certificate per unit. (Not to be
--    confused with the document API response's own ExpiresAt field, which
--    is just the signed download URL's short-lived TTL, unrelated to the
--    certificate's real expiration.)
--
-- maintenance_schedules therefore only needs Oil Change's real Samsara
-- intervals -- Annual DOT Inspection doesn't reference it.
create table maintenance_schedules (
  id text primary key, -- Samsara Schedule ID
  title text not null,
  distance_interval_miles integer not null,
  synced_at timestamptz not null default now()
);

-- Seeded from CLG's real Samsara schedule export (2026-09-01) -- these are
-- the actual configured intervals, not a guess.
insert into maintenance_schedules (id, title, distance_interval_miles) values
  ('4fdcbe7a-5274-4e76-95d2-632aeac3088f', 'Oil Change - Freightliner', 50000),
  ('7c1386d5-0604-4f4f-ae18-903e092e0309', 'Oil Change - Penske Freightliner', 64000),
  ('e1fb0959-3eaa-4374-b8ad-a65829db36f8', 'Oil Change - Penske Volvo', 55000),
  ('db6f548f-d356-4023-a086-6c8e893ecac8', 'Oil Change - Macks', 50000),
  ('ec4eee6a-e888-409d-acaa-a1ee8251de02', 'Oil Change - Volvo', 55000),
  ('708e6ff2-398b-4f09-a6d3-aa18f6496703', 'Oil Change - Freightliner', 65000)
on conflict (id) do nothing;

-- One row per (unit, kind) -- full-snapshot sync like unit_current_trip: a
-- unit that no longer applies (deactivated, no longer matched) just gets
-- deleted and re-inserted fresh by the sync, not versioned here.
--
-- due_date is always the field to read regardless of basis:
--   'alvys_certificate'  -- dot_inspection only. Real expiration date
--                            parsed from the Alvys document's AttachmentType
--                            label.
--   'no_document_on_file' -- dot_inspection only. No document on this
--                            unit matched a DOT-inspection-like label, or
--                            none had a parseable date. due_date is null.
--   'estimated_from_mileage_rate' -- oil_change only. See maintenance_schedules
--                            comment above for the estimation method.
--   'no_last_pm_on_file'  -- oil_change only. Unit has no last_pm_date at
--                            all -- nothing to project from. due_date null.
create table unit_maintenance_due (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  kind text not null, -- 'dot_inspection' | 'oil_change'
  label text not null, -- display name, e.g. "Annual DOT Inspection" or "Oil Change - Freightliner"
  schedule_id text references maintenance_schedules(id), -- oil_change only; null for dot_inspection
  current_odometer integer,
  due_date date,
  basis text not null,
  synced_at timestamptz not null default now(),
  unique (unit_id, kind)
);

alter table maintenance_schedules enable row level security;
alter table unit_maintenance_due enable row level security;

create policy "authenticated_all_maintenance_schedules" on maintenance_schedules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_unit_maintenance_due" on unit_maintenance_due
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
