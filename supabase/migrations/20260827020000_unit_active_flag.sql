-- Fleet Maintenance System — active/inactive flag on units
-- Run this in the Supabase SQL Editor after 20260827010000_downtime_platform.sql.

alter table units add column is_active boolean not null default true;

create index idx_units_is_active on units(is_active);
