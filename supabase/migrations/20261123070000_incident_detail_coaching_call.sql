-- Expose driver_incidents.coaching_call_id on driver_incident_detail so the
-- Accountability list can show which incidents were covered on the same coaching
-- call (see 20261123060000_coaching_call_bundling.sql). Column appended at the end;
-- existing grants are preserved by CREATE OR REPLACE.
create or replace view driver_incident_detail as
 SELECT i.id,
    i.driver_id,
    d.driver_name,
    i.event_date,
    inf.name AS infraction_name,
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
    d.current_score AS driver_score,
    d.fleet_average_score,
    accountability_fine_eligibility(i.coaching_stage, inf.severity, d.current_score, d.fleet_average_score) AS fine_eligibility,
    i.created_at,
    i.updated_at,
    i.training_platform,
    i.coaching_call_id
   FROM driver_incidents i
     JOIN accountability_infractions inf ON inf.id = i.infraction_id
     JOIN driver_accountability_status d ON d.driver_id = i.driver_id;
