-- Fleet Maintenance System — scorecard snapshots (before/after audit trail)
--
-- Scoring changes that re-run history (e.g. the speeding backfill/re-attribution
-- of 2026-11-11) move live driver scores, which feed fines. This table keeps a
-- labelled copy of the scorecard at a point in time so a before/after can be
-- shown per driver and a disputed score can be explained later.
-- RLS enabled with no policies: readable only with the service role / SQL
-- editor, not through the app's anon/authenticated API.

create table if not exists scorecard_snapshots (
  id bigserial primary key,
  snapshot_label text not null,
  taken_at timestamptz not null default now(),
  driver_id text not null,
  driver_name text,
  speeding_score numeric,
  safety_score numeric,
  hos_score numeric,
  overall_score numeric,
  speeding_event_count integer,
  safety_event_count integer,
  miles_driven numeric
);

alter table scorecard_snapshots enable row level security;

create index if not exists scorecard_snapshots_label_idx on scorecard_snapshots (snapshot_label, driver_id);

insert into scorecard_snapshots
  (snapshot_label, driver_id, driver_name, speeding_score, safety_score, hos_score, overall_score,
   speeding_event_count, safety_event_count, miles_driven)
select
  'pre_speeding_backfill_20261111', driver_id, driver_name, speeding_score, safety_score, hos_score, overall_score,
  speeding_event_count, safety_event_count, miles_driven
from driver_safety_scorecard;
