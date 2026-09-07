-- Fleet Maintenance System — add 'owned' to the equipment_ownership enum
--
-- equipment_ownership already exists (20260906040000_leased_equipment_values.sql)
-- with just 'penske_lease' / 'hale_lease', scoped to the standalone
-- leased_equipment_values table. The Units page redesign folds leased
-- equipment into `units` itself (see the next two migrations), so units
-- needs a third value to mark CLG's own equipment explicitly rather than
-- leaving ownership implicit.
--
-- This is deliberately its own migration, run and committed on its own,
-- before anything references 'owned' — Postgres won't allow a newly added
-- enum value to be used (e.g. as a column DEFAULT) inside the same
-- transaction that added it.

alter type equipment_ownership add value if not exists 'owned';
