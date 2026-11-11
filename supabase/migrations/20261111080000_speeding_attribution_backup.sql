-- Fleet Maintenance System — backup of speeding-interval driver attribution
--
-- Taken before re-running samsara-sync-driver-safety in backfill mode over
-- 2026-08-10 .. 2026-10-16 to re-attribute speeding intervals that were
-- stored before the 2026-10-28 switch to driver-vehicle-assignments. A
-- backfill overwrites samsara_driver_id/driver_id with whatever Samsara
-- returns now, so this keeps the pre-run values in case Samsara no longer
-- serves assignment records that far back. RLS enabled, no policies:
-- service role / SQL editor only.

create table if not exists audit_speeding_attribution_backup (
  id text primary key,
  samsara_driver_id text,
  driver_id text,
  backed_up_at timestamptz not null default now()
);

alter table audit_speeding_attribution_backup enable row level security;

insert into audit_speeding_attribution_backup (id, samsara_driver_id, driver_id)
select id, samsara_driver_id, driver_id
from driver_speeding_intervals
where start_time < '2026-10-17T00:00:00Z'
on conflict (id) do nothing;
