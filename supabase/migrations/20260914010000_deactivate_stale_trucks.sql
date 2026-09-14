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
-- Two entries in the never-synced set ("Parts", "Trailer 100143") are
-- outright garbage data entries, not real trucks -- handled separately
-- below (deletion) rather than deactivation, and only after confirming
-- they carry no fault_events/dvir_defects history worth preserving (both
-- tables cascade-delete on unit removal, unlike work_orders which
-- restricts it).
--
-- Run each numbered step in order. Steps 1 and 3 are read-only review
-- steps -- confirm the row count/list looks right before running the
-- write step that follows it.

-- =============================================================================
-- Step 1 (review): trucks this will deactivate. Confirm this list is what
-- you expect before running Step 2 -- a truck that's real but brand new
-- (no Samsara device installed yet) would show up here too and should be
-- excluded by hand if so.
-- =============================================================================
select number, year, make, model, vin, samsara_synced_at, alvys_synced_at
from units
where is_active = true
  and type = 'Truck'
  and samsara_synced_at is null
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
  and number not in ('Parts', 'Trailer 100143');

-- =============================================================================
-- Step 3 (review): confirm neither garbage entry has fault/DVIR history
-- that would be lost. If either returns a non-zero count, stop and tell me
-- before running Step 4 -- deleting the unit would cascade-delete that
-- history (fault_events/dvir_defects both reference units on delete
-- cascade), and we'd want to deactivate instead of delete in that case.
-- =============================================================================
select u.number,
       (select count(*) from work_orders wo where wo.unit_id = u.id) as work_order_count,
       (select count(*) from fault_events fe where fe.unit_id = u.id) as fault_event_count,
       (select count(*) from dvir_defects dd where dd.unit_id = u.id) as dvir_defect_count
from units u
where u.number in ('Parts', 'Trailer 100143');

-- =============================================================================
-- Step 4 (write): delete the garbage entries -- only run this if Step 3
-- showed zero work orders (the FK would block the delete anyway if not)
-- and you're comfortable losing any fault/DVIR rows it also showed.
-- =============================================================================
delete from units where number in ('Parts', 'Trailer 100143');
