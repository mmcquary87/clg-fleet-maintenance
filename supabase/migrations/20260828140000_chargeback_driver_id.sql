-- Fleet Maintenance System — link a chargeback to a real driver.
-- Same pattern as driver_roster/planned_home_time's driver_id: Log
-- Invoice's "Charge back to driver" field becomes a dropdown of real
-- synced Alvys drivers instead of free text.

alter table work_orders add column if not exists chargeback_driver_id text references drivers(id);
