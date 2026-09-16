-- Fleet Maintenance System — Annual Inspection Compliance notes
-- (2026-09-18)
--
-- Backing column for the new Annual Inspection Compliance console (per
-- Claude Design brief, 2026-09-18): a manual annotation layer per unit
-- (location, driver, follow-up flag) that's explicitly separate from
-- Alvys -- Alvys has no such field. Kept as a single current-state text
-- field on `units`, not a history/log table, matching the brief's "notes:
-- free-text, manually maintained" (present tense, not an audit trail).
--
-- The page's own expiration/days-until-due math reuses the existing
-- `last_annual_inspection_date`/ANNUAL_INSPECTION_INTERVAL_DAYS pattern
-- from maintenanceSchedule.js -- no new date column needed here.

alter table units add column if not exists annual_inspection_notes text;
