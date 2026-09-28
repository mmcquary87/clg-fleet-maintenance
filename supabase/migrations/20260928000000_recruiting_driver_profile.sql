-- Owner-Operator Recruiting -- standardized driver profile fields on leads
--
-- Scoped down from a broader "where does he live, how experienced is he,
-- where's he willing to run" conversation to just the handful of fields
-- worth standardizing as dropdowns so they're reportable later -- home
-- location (city/state) already exists on leads, and anything that
-- doesn't fit a standard field already has a home in lead_conversations
-- (LogInteractionForm's free-text notes/call log).
--
-- Nullable, and not restricted to segment = 'driver' at the DB level --
-- the frontend only shows/edits this section for driver leads, but
-- nothing here stops a value being set on another segment later.

create type driver_home_time_cadence as enum ('home_daily', 'home_weekly', 'home_every_2_weeks', 'otr_flexible');
create type driver_run_preference as enum ('otr', 'regional', 'dedicated_local');
create type driver_experience_bucket as enum ('lt_1', 'yrs_1_2', 'yrs_3_5', 'yrs_6_10', 'yrs_10_plus');
create type driver_equipment_type as enum ('dry_van', 'reefer', 'flatbed', 'tanker', 'other');
create type driver_endorsement as enum ('hazmat', 'tanker', 'doubles_triples', 'passenger', 'school_bus');

alter table leads
  add column home_time_cadence driver_home_time_cadence,
  add column run_preference driver_run_preference,
  add column preferred_lanes text,
  add column experience_bucket driver_experience_bucket,
  add column equipment_experience driver_equipment_type[] not null default '{}',
  add column endorsements driver_endorsement[] not null default '{}';
