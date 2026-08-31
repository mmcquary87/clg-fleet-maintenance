-- Fleet Maintenance System — track pickup AND delivery stops, with arrival
--
-- Two problems with the Tracking page as built:
--
-- 1. It always projected an ETA against the load's final DELIVERY stop,
--    even for a truck that hasn't picked up yet -- so a shipper running
--    late never showed up as risk, only a consignee.
--
-- 2. There was no signal anywhere for "the driver already checked in at
--    this stop." Without it, a truck that had genuinely already arrived
--    could still get flagged Late Risk: Samsara's GPS only refreshes every
--    15 minutes, so right at/just after arrival the last-known position
--    can still show a small nonzero distance to the stop, and if the
--    driver's HOS drive-clock is nearly exhausted (common at the end of a
--    long haul), the mandatory-10-hour-reset math treats that residual
--    distance as needing a full reset -- producing a dramatic false
--    "Late Risk" for a load that already delivered.
--
-- Renaming destination_*/delivery_* to generic stop_* because these
-- columns now hold whichever stop -- pickup or delivery -- the sync
-- determined is actually next (the first stop without a DepartedAt),
-- not always the final delivery.

alter table unit_current_trip rename column destination_name to stop_name;
alter table unit_current_trip rename column destination_lat to stop_lat;
alter table unit_current_trip rename column destination_lng to stop_lng;
alter table unit_current_trip rename column delivery_appointment_at to stop_appointment_at;
alter table unit_current_trip rename column delivery_window_start to stop_window_start;
alter table unit_current_trip rename column delivery_window_end to stop_window_end;

alter table unit_current_trip add column stop_type text; -- 'Pickup' | 'Delivery'
alter table unit_current_trip add column stop_arrived_at timestamptz;
