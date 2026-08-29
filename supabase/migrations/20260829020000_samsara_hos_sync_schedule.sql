-- Fleet Maintenance System — recurring Samsara HOS sync (pg_cron + pg_net)
--
-- Same pattern as 20260828150000_samsara_sync_schedule.sql and
-- 20260829010000_alvys_active_trips_schedule.sql, on the same 15-minute
-- cadence. Reuses the service_role_key already stored in Vault by the
-- first of those migrations.
--
-- Replace <YOUR_PROJECT_REF> below with your actual Supabase project ref
-- (Settings -> API -> Project URL) before running.

select cron.schedule(
  'samsara-hos-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/samsara-hos-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('samsara-hos-sync-every-15-min');
