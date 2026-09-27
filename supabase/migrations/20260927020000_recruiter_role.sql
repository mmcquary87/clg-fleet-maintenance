-- Fleet Maintenance System — Owner-Operator Recruiting: recruiter role
--
-- RECRUITING.md's own build order (modules 5-7: handoff, onboarding
-- tracker, recruiter dashboard) refers to "the recruiter" throughout as
-- a single, distinct person from dispatcher/mechanic/admin. Adds it as
-- a new profiles.role value now so a real account can be invited ahead
-- of the recruiter-facing UI being built -- the frontend restricts this
-- role to a placeholder view in the meantime (see Dashboard.jsx) rather
-- than falling through to full dispatcher-level access to fleet data
-- that isn't this person's job.

alter type user_role add value 'recruiter';
