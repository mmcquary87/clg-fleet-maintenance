-- Fleet Maintenance System — recurring Alvys equipment sync (pg_cron + pg_net)
-- (2026-09-18)
--
-- alvys-sync-equipment was manual/on-demand only (per its own header
-- comment, a "historical backfill, safe to re-run by hand") -- but it's
-- also the only thing that ever flips units.is_active back off when a
-- unit drops out of Alvys's active roster (sold, retired, swapped). With
-- no schedule, is_active is only ever as fresh as whenever someone last
-- ran it manually, and silently goes stale in between -- confirmed
-- 2026-09-18 when unit 9482 showed Active on the Annual Inspection
-- Compliance console despite already being inactive in Alvys.
--
-- Every 6 hours, not 15 minutes like the GPS/DOT-inspection syncs --
-- equipment gets retired/swapped/sold on the order of days, not minutes,
-- and this does a full paginated fetch of the whole active fleet (unlike
-- alvys-sync-dot-inspections' incremental unresolved-only approach), so
-- there's no reason to run it anywhere near that often.
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
  'alvys-sync-equipment-every-6-hours',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/alvys-sync-equipment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('alvys-sync-equipment-every-6-hours');
