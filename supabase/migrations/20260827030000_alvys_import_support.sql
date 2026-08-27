-- Fleet Maintenance System — Alvys import support
-- Run this in the Supabase SQL Editor after 20260827020000_unit_active_flag.sql.

-- Dedupe key so re-running the Alvys maintenance import is safe (upsert,
-- not duplicate rows) and so imported rows are identifiable later.
alter table work_orders add column alvys_maintenance_id text unique;

-- Dedupe key for equipment sync matching Alvys trucks/trailers to our units.
alter table units add column alvys_asset_id text unique;
