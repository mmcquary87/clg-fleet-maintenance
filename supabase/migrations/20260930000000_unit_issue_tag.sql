-- Fleet Maintenance System — persistent per-unit "issue tag" (2026-09-30)
--
-- CLG's own Alvys trailer-tracking screen carries a standing Issue Tag +
-- Issue Tag Note per trailer, independent of whether there's currently an
-- open work order in this app -- e.g. "Resolution Pending Completion" /
-- "Missing vent cover, told to take to EQVS". This app already tracks
-- "truck down" as a boolean (units.can_move_load, set by the intake
-- wizard's "Unit down" severity, surfaced on the Board and Units' "Down"
-- count) but has nothing for a short descriptive status once an issue is
-- being worked, which is what these two columns are for.
--
-- Free text, not an enum -- Alvys's own tag vocabulary isn't confirmed
-- yet (see the alvys-explore-trailer-issue-fields probe), and CLG should
-- be able to phrase a status in CLG OS without waiting on that. Whether
-- this ever writes back to Alvys is a separate, still-open question
-- (Alvys's public API has no documented write endpoint for truck/trailer
-- records as of this writing) -- these columns stand on their own in the
-- meantime as CLG OS's own source of truth.

alter table units add column if not exists issue_tag text;
alter table units add column if not exists issue_tag_note text;
