-- Fleet Maintenance System — fix the two Alvys sync schedules (2026-11-17)
--
-- Both original schedule migrations
-- (20260917020000_alvys_maintenance_sync_schedule.sql and
-- 20260918060000_alvys_sync_equipment_schedule.sql) shipped with the literal
-- placeholder https://<YOUR_PROJECT_REF>.supabase.co in the URL and were meant
-- to be edited before running. The maintenance job was created with the
-- placeholder still in it, so every one of its runs since 2026-09-15 failed
-- ("invalid URL ... Bad hostname", 5,655 failed runs) and only manual runs ever
-- imported anything. The equipment job was never created at all, so units/
-- is_active/DOT-inspection/PM/Midtrip due data from Alvys stopped refreshing
-- after the last manual run on 2026-10-30.
--
-- cron.schedule() with an existing job name updates that job in place, so this
-- repairs the maintenance job (same name, same */15 cadence) and creates the
-- equipment job (every 6 hours, as originally intended). Re-runnable.
--
-- Uses the existing Vault secret 'service_role_key' (shared by every cron job).
--
-- BACK OUT:
--   select cron.unschedule('alvys-maintenance-sync-every-15-min');
--   select cron.unschedule('alvys-sync-equipment-every-6-hours');

select cron.schedule(
  'alvys-maintenance-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fxveuksdxjovgsxrevpa.supabase.co/functions/v1/alvys-import-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);

select cron.schedule(
  'alvys-sync-equipment-every-6-hours',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://fxveuksdxjovgsxrevpa.supabase.co/functions/v1/alvys-sync-equipment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
