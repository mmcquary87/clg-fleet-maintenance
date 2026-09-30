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
--
-- Re-run-safe: a first attempt at this file errored partway through
-- ("type driver_home_time_cadence already exists" on a second run) --
-- Postgres has no CREATE TYPE IF NOT EXISTS, so each type is wrapped in
-- a DO block that swallows the duplicate_object error, and every column
-- add uses IF NOT EXISTS. Safe to run this file again regardless of how
-- far a previous attempt got.

do $$ begin
  create type driver_home_time_cadence as enum ('home_daily', 'home_weekly', 'home_every_2_weeks', 'otr_flexible');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type driver_run_preference as enum ('otr', 'regional', 'dedicated_local');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type driver_experience_bucket as enum ('lt_1', 'yrs_1_2', 'yrs_3_5', 'yrs_6_10', 'yrs_10_plus');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type driver_equipment_type as enum ('dry_van', 'reefer', 'flatbed', 'tanker', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type driver_endorsement as enum ('hazmat', 'tanker', 'doubles_triples', 'passenger', 'school_bus');
exception when duplicate_object then null;
end $$;

alter table leads
  add column if not exists home_time_cadence driver_home_time_cadence,
  add column if not exists run_preference driver_run_preference,
  add column if not exists preferred_lanes text,
  add column if not exists experience_bucket driver_experience_bucket,
  add column if not exists equipment_experience driver_equipment_type[] not null default '{}',
  add column if not exists endorsements driver_endorsement[] not null default '{}';
