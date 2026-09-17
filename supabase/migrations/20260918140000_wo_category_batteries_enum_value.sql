-- Fleet Maintenance System — add "Batteries" wo_category enum value
--
-- New top-level category so batteries and jump-starts aren't buried under
-- "Electrical" or "General Repair" -- CLG wants them tracked separately.
-- Added to CATEGORIES (web/src/lib/categories.js) and scan-invoice's own
-- CATEGORIES list in the same change, per CLAUDE.md's category-drift
-- warning (the enum, the frontend list, and scan-invoice's list all need
-- to agree).
--
-- `alter type ... add value` cannot run in the same transaction as a
-- statement that USES the new value (Postgres restriction) -- must be its
-- own standalone statement/run, same as the Tow value added in
-- 20260908020000_wo_category_tow_enum_value.sql.

alter type wo_category add value if not exists 'Batteries';
