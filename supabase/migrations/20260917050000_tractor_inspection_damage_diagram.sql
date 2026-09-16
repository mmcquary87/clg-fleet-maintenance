-- Fleet Maintenance System — truck damage diagram on tractor inspections
-- (2026-09-17)
--
-- Rental-car-style click-to-mark damage: front/driver-side/passenger-
-- side/rear schematics, each click drops a numbered marker with a short
-- note. Stored as one flat JSON array across all four views (each marker
-- carries its own `view`) rather than four separate columns -- simpler
-- to persist/restore as a single field, and the view is just a display
-- grouping, not a meaningfully separate dataset.
--
-- Shape: [{ id, view, x, y, note }], x/y as percentages (0-100) of the
-- schematic's width/height, so the same marker set replays correctly
-- regardless of how large the diagram is rendered later.

alter table tractor_inspections add column if not exists damage_diagram_markers jsonb not null default '[]'::jsonb;
