-- Fleet Maintenance System — recurring Alvys active-trip sync (pg_cron + pg_net)
--
-- Same pattern as 20260828150000_samsara_sync_schedule.sql, on the same
-- 15-minute cadence the user asked for on the Tracking page. Reuses the
-- service_role_key already stored in Vault by that earlier migration —
-- if you haven't run that one (or the secret was since removed), run its
-- vault.create_secret step first or this will silently fail to authorize.
--
-- Replace <YOUR_PROJECT_REF> below with your actual Supabase project ref
-- (Settings -> API -> Project URL) before running.

select cron.schedule(
  'alvys-sync-active-trips-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/alvys-sync-active-trips',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('alvys-sync-active-trips-every-15-min');
