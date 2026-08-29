-- Fleet Maintenance System — delivery window start (Late Load Exposure)
--
-- Per late-load-exposure-calc-spec.md's leadTimeHours (runway to react =
-- appointment_window_start - now). unit_current_trip only stored the window
-- END until now (delivery_window_end / delivery_appointment_at) — this adds
-- the START, populated from Alvys's Stops[].StopWindow.Begin for FCFS stops.
-- Null for APPT-type stops (a point-in-time appointment has no separate
-- window to run up to) — the frontend falls back to treating the deadline
-- itself as the start in that case, per the spec's own "runway to react".

alter table unit_current_trip add column delivery_window_start timestamptz;
