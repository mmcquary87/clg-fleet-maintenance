-- Fleet Maintenance System — add missing "Tow" wo_category enum value
--
-- CATEGORIES in web/src/lib/categories.js has included "Tow" for a while
-- (its own color, its own segmented-control entry on the Work Orders page),
-- but the Postgres wo_category enum was never given a matching value --
-- confirmed by a user hitting a real error moving a work order from
-- Other to Tow. Per CLAUDE.md's own category-drift warning: the enum, the
-- frontend CATEGORIES list, and scan-invoke's CATEGORIES list all need to
-- agree.
--
-- `alter type ... add value` cannot run in the same transaction as a
-- statement that USES the new value (Postgres restriction) -- must be its
-- own standalone statement/run, same as the ownership enum value added in
-- 20260907010000_unit_ownership_enum_value.sql.

alter type wo_category add value if not exists 'Tow';
