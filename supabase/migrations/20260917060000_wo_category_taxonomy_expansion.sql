-- Fleet Maintenance System — work order category taxonomy expansion
-- (2026-09-17)
--
-- 528 real work orders ($393,223, 31.2% of spend) sit under "Other" today.
-- Digging into that data found two concrete bugs (the "Tow" enum gap,
-- already fixed in 20260908020000, and a "battery"/"batteries" substring
-- miss in the Alvys classifier, fixed in code alongside this migration)
-- plus a real gap in the taxonomy itself: several genuinely distinct
-- repair categories (suspension, emissions/aftertreatment, HVAC,
-- detailing) were being forced into Engine/PM-Oil/Other because there was
-- nowhere else for them to go. Per CLG's own preference, "Other" is
-- renamed to "General Repair" -- a legitimate catch-all for genuinely
-- non-specific entries, not a red flag. "Wheel End" (spindle/hub
-- seal/hub assembly/wheel bearing) was considered and deliberately NOT
-- added -- left for a human to sort into Tires or General Repair.
--
-- RENAME VALUE (PG10+, no transaction restrictions) relabels existing
-- rows in place -- every current "Trailer / Body"/"Other" row displays
-- under its new name immediately, no data migration needed. ADD VALUE
-- cannot be used in the same transaction as a statement that USES the
-- new value (see 20260908020000's comment) -- this migration only adds
-- values, it doesn't use them, so it's safe as one file; the actual
-- reclassification of existing "General Repair" rows into these new
-- categories is a separate, manually-reviewed UPDATE, not part of this
-- migration.
--
-- Sync note: web/src/lib/categories.js and
-- supabase/functions/scan-invoice/index.ts's CATEGORIES arrays must match
-- this enum -- updated in the same change as this migration.

alter type wo_category rename value 'Trailer / Body' to 'Body / Structural';
alter type wo_category rename value 'Other' to 'General Repair';

alter type wo_category add value if not exists 'Suspension';
alter type wo_category add value if not exists 'Emissions / Aftertreatment';
alter type wo_category add value if not exists 'HVAC';
alter type wo_category add value if not exists 'Detailing / Cleaning';
