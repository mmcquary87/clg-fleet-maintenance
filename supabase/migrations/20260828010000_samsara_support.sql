-- Fleet Maintenance System — Samsara integration support
-- Run this in the Supabase SQL Editor after 20260828000000_unit_equipment_details.sql.

-- Dedup key for fault_events (Samsara fault code readings have no natural
-- unique id for one DTC occurrence, so we synthesize one: vehicle+code+time).
alter table fault_events add column samsara_fault_key text unique;

-- Live-ish snapshot fields on units, refreshed by the periodic Samsara pull.
alter table units add column last_fuel_percent numeric(5, 2);
alter table units add column samsara_synced_at timestamptz;
