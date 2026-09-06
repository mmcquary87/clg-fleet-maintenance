-- Fleet Maintenance System — insurance premium rates (mileage-driven)
--
-- Supports the Spend page's Insurance view: auto liability and motor
-- truck cargo premiums are both rated per 100 miles of fleet exposure,
-- same math as CLG's own "CLG Monthly Equipment & Insurance Reporter"
-- workbook. Defaults below are the real current rates from that workbook
-- (as of the 2026 policy period) -- not a guess -- but these change at
-- every policy renewal, so they're a singleton-row setting (same pattern
-- as shop_labor_rate), admin-editable from Settings, not a hardcoded
-- constant in the calculation code.
--
-- Physical damage premium (rated on equipment value, not mileage) is
-- intentionally not included here -- it depends on a current market value
-- per unit, which the Asset Lifecycle module (20260906000000) only has
-- once comps are entered per unit, not fleet-wide yet.

alter table app_settings add column if not exists insurance_auto_liability_rate_per_100mi numeric(8, 3) not null default 13.472;
alter table app_settings add column if not exists insurance_cargo_rate_per_100mi numeric(8, 3) not null default 1.226;
