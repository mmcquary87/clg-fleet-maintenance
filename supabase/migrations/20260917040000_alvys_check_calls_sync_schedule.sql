-- Fleet Maintenance System — recurring Alvys Check Calls sync (pg_cron + pg_net)
--
-- Same pg_cron + pg_net pattern as the other scheduled Alvys/Samsara
-- syncs. 15 minutes matches the cadence already used for
-- alvys-sync-active-trips (the trip list this sync polls against) and
-- sits inside the spec's own suggested 5-15 minute range for check-call
-- polling.
--
-- ⚠️ Skip the Vault secret step below if an earlier schedule migration in
-- this project already created it -- it's shared across every cron job
-- here, not per-function.
--
-- 1. Store your service role key in Vault, if not already done (Settings
--    → API → service_role "reveal" to copy it — NEVER commit this key to
--    git, which is why it's not written into this file):
--
--      select vault.create_secret('<PASTE_YOUR_SERVICE_ROLE_KEY_HERE>', 'service_role_key');
--
-- 2. Below, replace <YOUR_PROJECT_REF> with your actual Supabase project
--    ref (Settings → API → Project URL).
--
-- Then run the rest of this file as-is.

select cron.schedule(
  'alvys-sync-check-calls-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/alvys-sync-check-calls',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('alvys-sync-check-calls-every-15-min');
