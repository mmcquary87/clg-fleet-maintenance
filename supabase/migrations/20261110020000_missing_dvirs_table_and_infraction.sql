-- Fleet Maintenance System — Missing DVIR tracking (UAT #10/#11)
--
-- CLGOS had no concept of a missing pre-trip DVIR at all (only dvir_defects,
-- which only exists for a DVIR that WAS submitted). samsara-sync-missing-dvirs
-- populates this table by comparing driver HOS duty-status shift starts
-- against Samsara's pre-trip DVIR history (see that function's header for
-- the detection logic and its calibration against a real CSV export).

create table missing_dvirs (
  id text primary key,
  unit_id uuid references units(id),
  samsara_vehicle_id text not null,
  driver_id text references drivers(id),
  samsara_driver_id text,
  trip_start_time timestamptz not null,
  trip_end_time timestamptz,
  detected_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index idx_missing_dvirs_driver_id on missing_dvirs(driver_id);
create index idx_missing_dvirs_trip_start_time on missing_dvirs(trip_start_time);

alter table missing_dvirs enable row level security;

create policy "missing_dvirs_select_all" on missing_dvirs
  for select using (auth.role() = 'authenticated');

insert into accountability_infractions
  (name, violation_family, severity, points, rollover_days, fine_amount, counts_toward_score)
values
  ('Missing DVIR', 'DVIR', 'Minor', 0.25, 60, 25, true);
