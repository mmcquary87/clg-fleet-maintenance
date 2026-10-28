-- Driver Accountability — fine-protection needs an 80% floor, not just
-- "at/above fleet average"
--
-- Per the official "Driver Safety Infraction & Accountability Program"
-- (FINAL, 2026-10-28), a driver is only shielded from routine fines/coaching
-- for Minor/Moderate violations when they are BOTH at/above the current
-- fleet average AND at/above the 80% program minimum ("Drivers Meeting the
-- Coaching-Priority Threshold" / Seasoned Drivers fine conditions). Heavy
-- and Severe violations are always fine-eligible regardless.
--
-- driver_accountability_status.fine_protection_status (20261007060000,
-- ported from the old Excel workbook) only ever checked
-- overall_score >= fleet_average_score -- no 80% floor -- so a driver could
-- sit above a depressed fleet average but below 80% and still be wrongly
-- marked protected. driver_incident_detail.fine_eligibility duplicates the
-- same comparison independently and needs the same fix.
--
-- driver_incident_detail picked up a training_platform column since
-- (20261014010000) -- preserved here, appended at the same position, so
-- this stays a column-compatible CREATE OR REPLACE.

create or replace view driver_accountability_status as
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
    when dsc.overall_score >= dsc.fleet_average_score and dsc.overall_score >= 80 then 'Protected Except Heavy/Severe'
    else 'Below Fleet Average'
  end as fine_protection_status
from drivers d
left join driver_safety_scorecard dsc on dsc.driver_id = d.id;

create or replace view driver_incident_detail as
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
    when d.current_score < d.fleet_average_score or d.current_score < 80 then 'Yes'
    else 'No'
  end as fine_eligibility,
  i.created_at,
  i.updated_at,
  i.training_platform
from driver_incidents i
join accountability_infractions inf on inf.id = i.infraction_id
join driver_accountability_status d on d.driver_id = i.driver_id;
