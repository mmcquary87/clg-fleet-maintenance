-- Schedule samsara-sync-driver-app-sessions every 15 minutes (2026-11-23). Uses the Vault
-- secret 'service_role_key' and the real project URL (see 20261117010000 for the earlier
-- placeholder-URL mistake).
--
-- BACK OUT: select cron.unschedule('samsara-driver-app-sessions-every-15-min');
select cron.schedule(
  'samsara-driver-app-sessions-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fxveuksdxjovgsxrevpa.supabase.co/functions/v1/samsara-sync-driver-app-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
