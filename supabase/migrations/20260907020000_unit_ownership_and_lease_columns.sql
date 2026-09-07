-- Fleet Maintenance System — ownership/plate/lease columns on units
--
-- Units page redesign, phase 1 (data model). Every existing row defaults
-- to 'owned' — this migration must run after 20260907010000 added that
-- enum value in its own committed transaction.
--
-- plate_number/plate_expires_at: no equivalent column existed anywhere
-- before this (confirmed by grepping every migration for "plate" — zero
-- hits) despite plate/registration being one of the most basic things a
-- fleet page should track.
--
-- lease_reference/lease_status_note: only meaningful for a leased unit —
-- lease_reference keeps the lessor's own raw identifier/notes from the
-- source workbook for traceability back to Penske/Hale's own records;
-- lease_status_note surfaces a data-quality flag from that source (e.g. a
-- trailer the workbook itself marks "to be removed") rather than
-- silently resolving or hiding it.

alter table units add column if not exists ownership equipment_ownership not null default 'owned';
alter table units add column if not exists plate_number text;
alter table units add column if not exists plate_expires_at date;
alter table units add column if not exists lease_reference text;
alter table units add column if not exists lease_status_note text;

create index if not exists idx_units_ownership on units(ownership);
