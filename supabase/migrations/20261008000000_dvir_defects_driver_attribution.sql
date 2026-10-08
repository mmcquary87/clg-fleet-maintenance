-- Fleet Maintenance System — DVIR defect driver attribution
--
-- dvir_defects originally only ever kept unit_id/defect_type/
-- samsara_defect_id/is_resolved -- enough to convert a defect into a
-- work order, but nothing for a driver-facing DVIR page (the old Power
-- BI report's DVIR tab: VehicleID, TrailerID, Comment, MechanicNotes).
-- Confirmed via a real sample from /fleet/defects/history
-- (samsara-sync's diagnostic, 2026-10-08) that the endpoint actually
-- returns: a free-text `comment`, a `resolvedBy` {id, name, type} (who
-- closed it out -- not necessarily who reported it, but the closest
-- attribution this endpoint offers), and a `mechanicNotesUpdatedAtTime`
-- with no accompanying notes text in the list response (so no
-- mechanic_notes text column here -- nothing to put in it without an
-- N+1 per-defect detail call this app doesn't make).
--
-- driver_id is resolved by matching resolved_by_samsara_id against
-- drivers.samsara_driver_id, which samsara-sync-driver-safety already
-- populates -- no new name-matching needed.

alter table dvir_defects add column if not exists comment text;
alter table dvir_defects add column if not exists resolved_at timestamptz;
alter table dvir_defects add column if not exists resolved_by_samsara_id text;
alter table dvir_defects add column if not exists resolved_by_name text;
alter table dvir_defects add column if not exists resolved_by_type text;
alter table dvir_defects add column if not exists driver_id text references drivers(id);

create index if not exists idx_dvir_defects_driver_id on dvir_defects(driver_id);
