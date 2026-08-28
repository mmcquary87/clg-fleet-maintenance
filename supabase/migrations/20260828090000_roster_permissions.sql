-- Fleet Maintenance System — per-user roster edit permission.
-- Separate from `role` since roster rights aren't tied to being an admin —
-- an admin grants this to whichever specific users should be able to edit
-- the driver-availability roster (Settings → Users), everyone else stays
-- read-only. Read/write access itself is still enforced server-side (the
-- toggle here is data the roster's own RLS policies will check), not just
-- a UI affordance.

alter table profiles add column if not exists can_edit_roster boolean not null default false;
