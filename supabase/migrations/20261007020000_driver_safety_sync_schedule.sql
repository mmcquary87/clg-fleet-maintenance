-- Fleet Maintenance System — recurring Samsara driver-safety sync
--
-- Confirmed working against real data (first real run: 36 Samsara drivers
-- found, 21 linked by name, 7 HOS violations, 286 speeding intervals,
-- 31 fuel/energy rows, all in well under the Edge Function's execution
-- limit using the default 1-day window). Same pg_cron + pg_net pattern as
-- 20260828150000_samsara_sync_schedule.sql — every 15 minutes, Postgres
-- calls the Edge Function directly via HTTP.
--
-- Requires the 'service_role_key' Vault secret already created for
-- samsara-sync-every-15-min — if that schedule is already running, this
-- reuses the same secret and needs no extra setup.

select cron.schedule(
  'samsara-driver-safety-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fxveuksdxjovgsxrevpa.supabase.co/functions/v1/samsara-sync-driver-safety',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('samsara-driver-safety-sync-every-15-min');
