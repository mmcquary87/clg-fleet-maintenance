-- Fleet Maintenance System — recurring Alvys driver directory sync
-- (pg_cron + pg_net)
--
-- alvys-sync-drivers had no schedule at all -- unlike every other Alvys/
-- Samsara sync in this app (active-trips, check-calls, equipment,
-- samsara-sync), it only ever ran when someone manually clicked "Test" in
-- the dashboard, so the `drivers` table (feeds roster/compliance) only
-- refreshed on demand rather than on its own. A driver directory doesn't
-- change minute-to-minute, so this uses alvys-sync-equipment's 6-hour
-- cadence rather than the 15-minute one used for live trip/location data.
--
-- Same pattern as 20260918060000_alvys_sync_equipment_schedule.sql --
-- reuses the service_role_key already stored in Vault by
-- 20260828150000_samsara_sync_schedule.sql. Replace <YOUR_PROJECT_REF>
-- below with your actual Supabase project ref (Settings -> API -> Project
-- URL) before running.

select cron.schedule(
  'alvys-sync-drivers-every-6-hours',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/alvys-sync-drivers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('alvys-sync-drivers-every-6-hours');
