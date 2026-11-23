-- Fleet Maintenance System — schedule the Samsara coaching sessions sync (2026-11-23)
--
-- samsara-sync-coaching-sessions re-fetches the last 3 days of sessions (by updatedAtTime) every
-- 30 minutes. Uses the existing Vault secret 'service_role_key'. The URL is the real project
-- URL: two earlier schedule migrations shipped with a '<YOUR_PROJECT_REF>' placeholder and never
-- ran (see 20261117010000_fix_alvys_sync_schedules.sql).
--
-- BACK OUT: select cron.unschedule('samsara-coaching-sessions-every-30-min');

select cron.schedule(
  'samsara-coaching-sessions-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://fxveuksdxjovgsxrevpa.supabase.co/functions/v1/samsara-sync-coaching-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
