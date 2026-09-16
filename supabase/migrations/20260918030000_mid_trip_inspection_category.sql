-- Fleet Maintenance System — "Mid-Trip Inspection" work order category
-- (2026-09-18)
--
-- CLG wants Mid-Trip billable as its own category, one step in the New
-- Work Order/Mechanic New Job forms, rather than picking "DOT
-- Inspection" and then the existing inspectionType sub-dropdown
-- ("Annual" | "Midtrip") every time. That sub-dropdown stays as-is for
-- backward compatibility with however it's already used -- this adds a
-- second, more direct path to the same "when was this unit last
-- mid-tripped" tracking (NewWorkOrderForm.jsx/WorkOrderDetailModal.jsx
-- both update units.last_midtrip_date when they see this category too,
-- not just DOT Inspection + inspectionType="Midtrip").
--
-- Per CLAUDE.md's own category-drift warning: the enum, the frontend
-- CATEGORIES list, and scan-invoice's CATEGORIES list all need to agree
-- -- updated in the same change as this migration.

alter type wo_category add value if not exists 'Mid-Trip Inspection';
