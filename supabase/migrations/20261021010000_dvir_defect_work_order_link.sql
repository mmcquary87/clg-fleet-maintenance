-- Fleet Maintenance System — link a DVIR defect to the work order raised
-- from it
--
-- wo_source already had a 'samsara_dvir' value (init_schema.sql) and
-- 'Open-Proposed' already existed as a status, but nothing in the app
-- ever actually created a work order from a DVIR defect -- the DVIR tab
-- on the Driver Safety Scorecard was read-only ("Informational only").
-- This adds the same traceability column the Check Call board's "Raise a
-- work order from this note" already uses (alvys_check_call_id,
-- 20260917030000_alvys_check_calls.sql), so a defect can show which work
-- order (if any) was raised from it instead of letting someone raise a
-- duplicate.
alter table work_orders add column if not exists dvir_defect_id uuid references dvir_defects(id) on delete set null;
create index if not exists idx_work_orders_dvir_defect_id on work_orders(dvir_defect_id);
