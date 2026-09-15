-- Fleet Maintenance System — recurring Alvys maintenance sync (pg_cron + pg_net)
--
-- alvys-import-maintenance has only ever run when someone manually clicks
-- "Test" in the dashboard -- that's why a real Alvys maintenance record
-- (truck 3303, Jump Start, 2026-09-17) sat unsynced for two days until
-- someone happened to notice it was missing. This makes it recurring:
-- every 15 minutes, same pg_cron + pg_net pattern as
-- 20260828150000_samsara_sync_schedule.sql.
--
-- Only safe to schedule because alvys-import-maintenance is now
-- insert-only by alvys_maintenance_id (see that function's header
-- comment) -- it never touches a record already in work_orders, so a
-- manual correction made after import (category, cost, vendor, status)
-- survives every future run instead of being silently reverted.
--
-- ⚠️ Skip step 1 below if 20260828150000_samsara_sync_schedule.sql already
-- created the `service_role_key` Vault secret in this project -- it's
-- shared across every cron job here, not per-function.
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

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'alvys-maintenance-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/alvys-import-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('alvys-maintenance-sync-every-15-min');
