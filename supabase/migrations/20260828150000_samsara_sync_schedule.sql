-- Fleet Maintenance System — recurring Samsara sync (pg_cron + pg_net)
--
-- samsara-sync has only ever run when someone manually clicks "Test" in
-- the dashboard (per SETUP.md: "DONE — manual pull, no recurring schedule
-- yet") — that's why the "Samsara last synced" timestamp on unit cards
-- goes stale until someone remembers to re-run it. This makes it actually
-- recurring: every 15 minutes, Postgres itself calls the Edge Function
-- via HTTP, using Supabase's own pg_cron + pg_net extensions — no
-- external scheduler needed.
--
-- ⚠️ BEFORE RUNNING THIS FILE, do two things in the Supabase SQL Editor:
--
-- 1. Store your service role key in Vault (Settings → API → service_role
--    "reveal" to copy it — NEVER commit this key to git, which is why
--    it's not written into this file):
--
--      select vault.create_secret('<PASTE_YOUR_SERVICE_ROLE_KEY_HERE>', 'service_role_key');
--
--    Run that ONE line by itself first, with your real key pasted in.
--
-- 2. Below, replace <YOUR_PROJECT_REF> with your actual Supabase project
--    ref (the subdomain in your dashboard URL, e.g. "abcdefghijklmnop" —
--    find it under Settings → API → Project URL).
--
-- Then run the rest of this file as-is.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'samsara-sync-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/samsara-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check it's running: select * from cron.job; and select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it: select cron.unschedule('samsara-sync-every-15-min');
