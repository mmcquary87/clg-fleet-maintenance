-- Fleet Maintenance System — Driver Accountability: training platform
--
-- Adds which platform a driver's assigned training lives on (TenStreet,
-- CarriersEdge, Samsara) alongside the existing training_assigned/
-- training_due_date/training_completed_date columns from
-- 20261007060000_driver_accountability.sql. Nullable/no default: only
-- meaningful once training_assigned is true, same as training_due_date.
create type accountability_training_platform as enum ('CarriersEdge', 'Samsara', 'TenStreet');

alter table driver_incidents add column training_platform accountability_training_platform;

-- Re-create driver_incident_detail to surface the new column -- appended
-- at the end of the select list so this is additive (Postgres allows
-- CREATE OR REPLACE VIEW only when existing column names/order/types are
-- unchanged).
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
    when d.current_score < d.fleet_average_score then 'Yes'
    else 'No'
  end as fine_eligibility,
  i.created_at,
  i.updated_at,
  i.training_platform
from driver_incidents i
join accountability_infractions inf on inf.id = i.infraction_id
join driver_accountability_status d on d.driver_id = i.driver_id;
