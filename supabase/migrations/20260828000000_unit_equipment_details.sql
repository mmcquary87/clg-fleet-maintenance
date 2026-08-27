-- Fleet Maintenance System — richer equipment details on units
-- Run this in the Supabase SQL Editor after 20260827030000_alvys_import_support.sql.

alter table units add column year integer;
alter table units add column make text;
alter table units add column model text;
alter table units add column fuel_type text;
