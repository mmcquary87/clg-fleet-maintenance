-- Fleet Maintenance System — recurring Missing DVIR sync (pg_cron + pg_net)
--
-- Same pattern as 20260828150000_samsara_sync_schedule.sql, but every 30
-- minutes rather than 15: this function does a fleet-wide HOS-logs fetch
-- (96h lookback) plus one narrow per-driver follow-up call per shift-start
-- candidate, so it's meaningfully heavier than the other samsara-sync-*
-- functions and more prone to tripping Samsara's rate limit if run too
-- often alongside them.
--
-- Requires the same `service_role_key` Vault secret as the other
-- samsara-sync-* schedules (already created if you've run
-- 20260828150000_samsara_sync_schedule.sql).

select cron.schedule(
  'samsara-sync-missing-dvirs-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://fxveuksdxjovgsxrevpa.supabase.co/functions/v1/samsara-sync-missing-dvirs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('samsara-sync-missing-dvirs-every-30-min');
