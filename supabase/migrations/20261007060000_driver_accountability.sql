-- Fleet Maintenance System — Driver Accountability Center
--
-- Ports "CLG_Driver_Accountability_Center.xlsx" (a live, in-use Excel
-- progressive-discipline tracker) into the app: same infraction taxonomy,
-- same severities/points/fine amounts, same coaching-stage and appeal
-- vocabulary, same fine-protection business rule. Same porting spirit as
-- 20260828100000_driver_roster.sql — computed values (fine eligibility,
-- score variance, fine-protection status) are a live view, not a stored
-- column, so they never go stale the way the spreadsheet's copy-pasted
-- "Current Driver Score" did.
--
-- Confirmed against the real workbook's Settings tab (Program Controls):
-- Fleet Minimum Score 80, Default Monitoring Window 90 days, New Driver
-- Grace Period 14 days — the last two already match
-- driver_safety_scorecard_view.sql exactly, so this reuses that view's
-- overall_score/fleet_average_score live instead of storing a second,
-- separately-maintained copy of "Current Driver Score" the way the
-- spreadsheet's Driver Roster tab did.
--
-- Fine-protection rule (from the workbook's Driver Roster/Incident Entry
-- formulas): a driver scoring at or above the fleet average is protected
-- from fines except for Heavy/Severe infractions; fines only ever apply
-- at coaching stages Driver Being Fined / Final Warning / Termination.
--
-- Write access is admin-only for now (this is HR/disciplinary data) —
-- widen via a profiles flag later (same pattern as
-- profiles.can_edit_roster) if more managers need to log incidents
-- directly.

create type accountability_severity as enum ('Minor', 'Moderate', 'Heavy', 'Severe');
create type accountability_coaching_stage as enum (
  'First Infraction', 'Second Infraction', 'Third Infraction',
  'Driver Being Fined', 'Final Warning', 'Termination'
);
create type accountability_appeal_status as enum ('Not Submitted', 'Pending', 'Approved', 'Denied');

create table accountability_infractions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  violation_family text not null,
  severity accountability_severity not null,
  points numeric not null,
  rollover_days int not null default 90,
  fine_amount numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seeded verbatim from the workbook's Settings tab (A6:F25).
insert into accountability_infractions (name, violation_family, severity, points, rollover_days, fine_amount) values
  ('Missing Driver Certification', 'Log Certification/App Usage', 'Minor', 0.5, 90, 25),
  ('Missing Shipping ID''s', 'Form & Manner', 'Minor', 0.5, 90, 25),
  ('Missing Trailer Name(s)', 'Form & Manner', 'Minor', 0.5, 90, 25),
  ('Harsh Brake', 'Safety Inbox Events', 'Moderate', 1, 90, 50),
  ('Rolling Stop', 'Safety Inbox Events', 'Moderate', 1, 90, 50),
  ('Harsh Turn', 'Safety Inbox Events', 'Moderate', 1, 90, 50),
  ('Moderate Speeding', 'Speeding', 'Moderate', 1, 90, 50),
  ('Missed Rest Break', 'Hours of Service', 'Moderate', 1, 90, 50),
  ('Yard Move Misuse', 'Yard Move', 'Moderate', 1, 90, 50),
  ('Harsh Accel', 'Safety Inbox Events', 'Moderate', 1, 90, 50),
  ('PC Misuse', 'Personal Conveyance', 'Moderate', 1, 90, 50),
  ('Close Following', 'Safety Inbox Events', 'Heavy', 2, 90, 100),
  ('Forward Collision Following', 'Safety Inbox Events', 'Heavy', 2, 90, 100),
  ('Heavy Speeding', 'Speeding', 'Heavy', 2, 90, 100),
  ('Shift Driving Limit', 'Hours of Service', 'Heavy', 2, 90, 100),
  ('Severe Speeding', 'Speeding', 'Severe', 3, 90, 200),
  ('Cycle Limit', 'Hours of Service', 'Severe', 3, 90, 200),
  ('Shift Duty Limit', 'Hours of Service', 'Severe', 3, 90, 200),
  ('Ran Red Light', 'Safety Inbox Events', 'Severe', 3, 90, 200),
  ('Crash', 'Safety Inbox Events', 'Severe', 3, 90, 200);

create table driver_incidents (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null references drivers(id),
  event_date date not null default current_date,
  infraction_id uuid not null references accountability_infractions(id),
  coaching_stage accountability_coaching_stage not null default 'First Infraction',
  notes text,
  driver_response text,
  issued_by text not null,
  follow_up_date date,
  training_assigned boolean not null default false,
  training_due_date date,
  training_completed_date date,
  appeal_status accountability_appeal_status not null default 'Not Submitted',
  appeal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_driver_incidents_driver_id on driver_incidents(driver_id);
create index idx_driver_incidents_event_date on driver_incidents(event_date);

-- Per-driver live status — current score and fleet average pulled from
-- driver_safety_scorecard (never a stale manual copy), plus the
-- fine-protection label the workbook computed per driver.
create view driver_accountability_status as
select
  d.id as driver_id,
  d.name as driver_name,
  d.is_active,
  dsc.overall_score as current_score,
  dsc.fleet_average_score,
  case when dsc.overall_score is not null and dsc.fleet_average_score is not null
    then dsc.overall_score - dsc.fleet_average_score end as score_variance,
  case
    when dsc.overall_score is null then 'Score Needed'
    when dsc.overall_score >= dsc.fleet_average_score then 'Protected Except Heavy/Severe'
    else 'Below Fleet Average'
  end as fine_protection_status
from drivers d
left join driver_safety_scorecard dsc on dsc.driver_id = d.id;

-- Per-incident detail — infraction lookup joined in, plus the same
-- fine-eligibility formula as the workbook's Incident Entry!U column:
-- fines only ever apply at the three "money" coaching stages, Heavy/Severe
-- infractions are always fine-eligible regardless of score, everything
-- else only fines a driver currently below the fleet average.
create view driver_incident_detail as
select
  i.id,
  i.driver_id,
  d.driver_name,
  i.event_date,
  inf.name as infraction_name,
  inf.violation_family,
  inf.severity,
  inf.points,
  inf.fine_amount,
  i.coaching_stage,
  i.notes,
  i.driver_response,
  i.issued_by,
  i.follow_up_date,
  i.training_assigned,
  i.training_due_date,
  i.training_completed_date,
  i.appeal_status,
  i.appeal_notes,
  d.current_score as driver_score,
  d.fleet_average_score,
  case
    when i.coaching_stage not in ('Driver Being Fined', 'Final Warning', 'Termination') then 'No'
    when inf.severity in ('Heavy', 'Severe') then 'Yes'
    when d.current_score is null or d.fleet_average_score is null then 'Review'
    when d.current_score < d.fleet_average_score then 'Yes'
    else 'No'
  end as fine_eligibility,
  i.created_at,
  i.updated_at
from driver_incidents i
join accountability_infractions inf on inf.id = i.infraction_id
join driver_accountability_status d on d.driver_id = i.driver_id;

alter table accountability_infractions enable row level security;
alter table driver_incidents enable row level security;

create policy "accountability_infractions_select_all" on accountability_infractions for select using (auth.role() = 'authenticated');
create policy "accountability_infractions_write_admin" on accountability_infractions for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "driver_incidents_select_all" on driver_incidents for select using (auth.role() = 'authenticated');
create policy "driver_incidents_write_admin" on driver_incidents for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
