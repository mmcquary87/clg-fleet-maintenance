-- Fleet Maintenance System — "AC / HVAC" rename + "Additives / Fluids" category
-- (2026-09-29)
--
-- "HVAC" already existed (added in 20260917060000_wo_category_taxonomy_expansion.sql)
-- but read ambiguously on its own -- renamed to "AC / HVAC" to read clearly as
-- the truck's own AC/heating/cooling system, not a building HVAC system.
-- RENAME VALUE (PG10+, no transaction restrictions) relabels every existing
-- "HVAC" row in place -- no data migration needed.
--
-- "Additives / Fluids" is a genuinely new category (oil additives, DEF fluid,
-- coolant additives, etc. that aren't a full PM/Oil service on their own).
-- ADD VALUE cannot be used in the same transaction as a statement that USES
-- the new value (see 20260908020000's comment) -- this migration only adds
-- it, doesn't use it, so it's safe alongside the rename in one file.
--
-- Sync note: web/src/lib/categories.js, supabase/functions/scan-invoice/index.ts's
-- CATEGORIES array, and supabase/functions/alvys-import-maintenance/index.ts's
-- CATEGORY_RULES classifier all updated in the same change as this migration,
-- per CLAUDE.md's category-drift warning.
--
-- Re-run-safe: a first attempt errored ("HVAC" is not an existing enum
-- label) -- meaning either the rename already succeeded on an earlier
-- try, or the original 20260917060000 migration that first added "HVAC"
-- was itself never applied. The block below covers both: rename if
-- "HVAC" is still there, else add "AC / HVAC" directly if neither label
-- exists yet, else (already renamed) do nothing.

do $$ begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'wo_category' and e.enumlabel = 'HVAC') then
    alter type wo_category rename value 'HVAC' to 'AC / HVAC';
  elsif not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'wo_category' and e.enumlabel = 'AC / HVAC') then
    alter type wo_category add value 'AC / HVAC';
  end if;
end $$;

alter type wo_category add value if not exists 'Additives / Fluids';
