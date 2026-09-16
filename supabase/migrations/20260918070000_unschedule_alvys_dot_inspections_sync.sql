-- Fleet Maintenance System — unschedule the superseded DOT inspections sync
-- (2026-09-18)
--
-- alvys-sync-equipment now reads each unit's real DOT inspection
-- expiration date directly off Alvys's own truck/trailer record
-- (InspectionExpirationDate/InspectionExpiresAt), on its own 6-hour
-- schedule (20260918060000) -- see that function's updated header
-- comment. alvys-sync-dot-inspections' document-label-parsing approach
-- is both less reliable (confirmed wrong for at least one unit) and the
-- one with real documented Alvys rate-limit trouble; no reason to keep
-- running it every 15 minutes on top of the better source.

select cron.unschedule('alvys-sync-dot-inspections-every-15-min');
