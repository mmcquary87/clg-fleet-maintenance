-- PM/Oil is odometer-based in practice (Debbie, 2026-10-12: trucks get
-- serviced by mileage, not a fixed day count -- intervals vary by make).
-- These are CLG-OS-native fields, separate from the existing Alvys
-- maintenance_due 'oil_change'/due_odometer data already surfaced read-only
-- via alvysPmNote() -- that feed has been unreliable/underused, so PM's own
-- "next due" now computes from these instead, falling back to the existing
-- last_pm_date/pm_interval_days when a unit has no odometer data on file
-- (e.g. a trailer, or before its first odometer-tracked PM here).
alter table units add column last_pm_odometer integer;
alter table units add column pm_interval_miles integer;
