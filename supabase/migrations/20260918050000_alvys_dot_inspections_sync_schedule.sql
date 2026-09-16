-- Fleet Maintenance System — recurring Alvys DOT Inspections sync (pg_cron + pg_net)
-- (2026-09-18)
--
-- Same pg_cron + pg_net pattern as the other scheduled Alvys/Samsara
-- syncs. alvys-sync-dot-inspections had only ever been run once
-- (2026-09-01, 241 units) and wasn't scheduled -- this keeps it current
-- as the fleet grows and lets it retry any unit that previously hit a
-- rate-limit error, without re-fighting Alvys's rate limit on units
-- already resolved.
--
-- Why 15 minutes is safe here specifically: this function is
-- INCREMENTAL -- see its own header comment -- it only processes units
-- with no resolved answer yet (no row, or a prior 'fetch_error'),
-- capped at BATCH_SIZE=60 per invocation, and skips anything already
-- marked 'alvys_certificate' or 'no_document_on_file'. The one full-
-- fleet run (241 units at once) is what triggered Alvys's coarse rate
-- limit before; a run against only the handful of unresolved units at
-- any given time (new units added since, or a previous fetch_error) is
-- a much smaller ask. Once the fleet is fully converged, each 15-minute
-- run is a cheap "check for unresolved units, find none, exit" no-op --
-- if a much larger backlog ever builds up again (e.g. many units added
-- at once), watch cron.job_run_details for repeated fetchErrors and
-- back this off to hourly if so.
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
  'alvys-sync-dot-inspections-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/alvys-sync-dot-inspections',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('alvys-sync-dot-inspections-every-15-min');
