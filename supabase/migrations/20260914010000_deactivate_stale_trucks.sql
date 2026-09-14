-- Fleet Maintenance System — one-time cleanup of phantom "active" trucks
--
-- Follow-up to 20260908030000-ish (alvys-sync-equipment auto-deactivation
-- fix, 2026-09-08): that fix stops NEW phantom units from accumulating
-- going forward, but doesn't touch units that were already stuck "active"
-- before it shipped. Confirmed via the Samsara-staleness query (2026-09-08
-- diagnostic, see conversation) that every real truck syncs with Samsara
-- every 15 minutes (samsara-sync's pg_cron schedule) -- a truck that has
-- NEVER synced is not a real, currently-driven truck. This signal is
-- deliberately truck-only: most trailers don't carry telematics hardware,
-- so a null samsara_synced_at is normal and expected for real trailers.
--
-- Two entries in the never-synced set ("Parts", "Trailer 100143") looked
-- like garbage data entries, not real trucks. Checked before deleting
-- them (2026-09-14): "Parts" has 9 real work orders attached, "Trailer
-- 100143" has 1 -- someone's been logging real repair cost against these
-- bad unit entries. Deleting would fail anyway (work_orders.unit_id is
-- "on delete restrict"), and would be wrong even if it succeeded -- that
-- cost history is real. Deactivated instead (Step 3), same as the rest of
-- this cleanup, so the history stays intact but they stop counting as
-- active fleet.
--
-- Run each numbered step in order. Step 1 is a read-only review step --
-- confirm the list looks right before running the write step that follows.

-- =============================================================================
-- Step 1 (review): trucks this will deactivate. Confirm this list is what
-- you expect before running Step 2 -- a truck that's real but brand new
-- (no Samsara device installed yet) would show up here too and should be
-- excluded by hand if so.
--
-- Scoped to alvys_asset_id is not null -- i.e. trucks alvys-sync-equipment
-- actually manages -- same as its own auto-deactivation logic. Correction
-- (2026-09-14): alvys_synced_at is a dead column, never written by any
-- edge function, so it's NULL for every unit regardless of real status --
-- alvys_asset_id is the real "is this an Alvys-managed truck" signal.
-- A truck with alvys_asset_id null (manually created, or a leased-import
-- row) is intentionally excluded here, same as the sync function excludes
-- it from auto-deactivation.
-- =============================================================================
select number, year, make, model, vin, samsara_synced_at, alvys_asset_id
from units
where is_active = true
  and type = 'Truck'
  and samsara_synced_at is null
  and alvys_asset_id is not null
  and number not in ('Parts', 'Trailer 100143')
order by number;

-- =============================================================================
-- Step 2 (write): deactivate them. Scoped to type = 'Truck' only -- this
-- signal does not apply to trailers (see note above), and does not touch
-- the two garbage entries (handled in steps 3-4 instead).
-- =============================================================================
update units
set is_active = false
where is_active = true
  and type = 'Truck'
  and samsara_synced_at is null
  and alvys_asset_id is not null
  and number not in ('Parts', 'Trailer 100143');

-- =============================================================================
-- Step 3 (write): "Parts" (9 work orders) and "Trailer 100143" (1 work
-- order) both carry real cost history -- confirmed 2026-09-14, see note
-- above. Deactivate rather than delete, same reasoning as Step 2.
-- =============================================================================
update units
set is_active = false
where number in ('Parts', 'Trailer 100143');

-- =============================================================================
-- Step 4 (recovery, run once): the very first version of Step 2 given out
-- was missing the "alvys_asset_id is not null" condition -- it was run
-- as-is against production before the correction above was made. That
-- earlier run would have also deactivated any manually-created or
-- leased-import truck (no alvys_asset_id) that also had no Samsara sync,
-- which was never the intent. This restores exactly that subset back to
-- active. Safe to run even if nothing was actually caught by the mistake
-- (matches zero rows in that case).
-- =============================================================================
update units
set is_active = true
where is_active = false
  and type = 'Truck'
  and samsara_synced_at is null
  and alvys_asset_id is null
  and number not in ('Parts', 'Trailer 100143');
