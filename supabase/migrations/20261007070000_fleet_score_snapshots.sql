-- Fleet Maintenance System — Fleet score snapshots (feeds the Scorecard's Trends tab)
--
-- driver_safety_scorecard is a LIVE view (trailing 90-day window recomputed
-- on every query) — it has no memory of what the fleet average was last
-- week, which is exactly what a "Trends" chart needs. This adds a
-- once-daily snapshot table, populated by a direct SQL pg_cron job (no
-- edge function needed, it's a pure DB read-and-insert) rather than
-- retroactively faking history that was never computed.
--
-- Seeds today's row immediately so the Trends tab isn't empty on day one;
-- real week-over-week trend lines only become meaningful after several
-- days/weeks of accumulation, same honest caveat as
-- driver_safety_scorecard_view.sql's own header.

create table fleet_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  fleet_average_score numeric,
  scored_driver_count int not null default 0,
  green_count int not null default 0,
  yellow_count int not null default 0,
  red_count int not null default 0,
  avg_speeding_score numeric,
  avg_safety_score numeric,
  avg_hos_score numeric,
  created_at timestamptz not null default now()
);

alter table fleet_score_snapshots enable row level security;
create policy "fleet_score_snapshots_select_all" on fleet_score_snapshots for select using (auth.role() = 'authenticated');
-- No write policy for authenticated/anon — only the service-role-run
-- pg_cron job below (and migrations) ever write to this table.

-- Seed today's snapshot right now.
insert into fleet_score_snapshots (
  snapshot_date, fleet_average_score, scored_driver_count, green_count, yellow_count, red_count,
  avg_speeding_score, avg_safety_score, avg_hos_score
)
select
  current_date,
  avg(overall_score) filter (where overall_score is not null),
  count(*) filter (where overall_score is not null),
  count(*) filter (where score_band = 'green'),
  count(*) filter (where score_band = 'yellow'),
  count(*) filter (where score_band = 'red'),
  avg(speeding_score) filter (where overall_score is not null),
  avg(safety_score) filter (where overall_score is not null),
  avg(hos_score) filter (where overall_score is not null)
from driver_safety_scorecard
on conflict (snapshot_date) do update set
  fleet_average_score = excluded.fleet_average_score,
  scored_driver_count = excluded.scored_driver_count,
  green_count = excluded.green_count,
  yellow_count = excluded.yellow_count,
  red_count = excluded.red_count,
  avg_speeding_score = excluded.avg_speeding_score,
  avg_safety_score = excluded.avg_safety_score,
  avg_hos_score = excluded.avg_hos_score;

-- Once daily (09:00 UTC) — a pure SQL job, no net.http_post/edge function
-- needed since this only ever reads driver_safety_scorecard and inserts
-- into a table in the same database.
select cron.schedule(
  'fleet-score-snapshot-daily',
  '0 9 * * *',
  $$
  insert into fleet_score_snapshots (
    snapshot_date, fleet_average_score, scored_driver_count, green_count, yellow_count, red_count,
    avg_speeding_score, avg_safety_score, avg_hos_score
  )
  select
    current_date,
    avg(overall_score) filter (where overall_score is not null),
    count(*) filter (where overall_score is not null),
    count(*) filter (where score_band = 'green'),
    count(*) filter (where score_band = 'yellow'),
    count(*) filter (where score_band = 'red'),
    avg(speeding_score) filter (where overall_score is not null),
    avg(safety_score) filter (where overall_score is not null),
    avg(hos_score) filter (where overall_score is not null)
  from driver_safety_scorecard
  on conflict (snapshot_date) do update set
    fleet_average_score = excluded.fleet_average_score,
    scored_driver_count = excluded.scored_driver_count,
    green_count = excluded.green_count,
    yellow_count = excluded.yellow_count,
    red_count = excluded.red_count,
    avg_speeding_score = excluded.avg_speeding_score,
    avg_safety_score = excluded.avg_safety_score,
    avg_hos_score = excluded.avg_hos_score;
  $$
);

-- To check it's running: select * from cron.job where jobname = 'fleet-score-snapshot-daily';
-- To stop it: select cron.unschedule('fleet-score-snapshot-daily');
