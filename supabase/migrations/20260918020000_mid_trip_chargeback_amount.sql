-- Fleet Maintenance System — flat Mid-Trip inspection chargeback fee
-- (2026-09-18)
--
-- CLG charges a flat $30 fee for a mid-trip inspection, applied the same
-- way no matter who ends up paying it -- unlike the existing
-- owner_operator_chargeback_amount (20260911010000), which only
-- flat-rates owner-operators and still charges company drivers actual
-- cost, this fee is never driver-type-conditional. Defaults to 30.00
-- (not left blank/null like the owner-operator amount) since CLG gave a
-- confirmed number up front rather than a TBD one.
--
-- Charging it reuses the existing work_orders chargeback mechanism
-- (is_chargeback/chargeback_driver_id/chargeback_driver_name) rather
-- than inventing a parallel ledger, so it shows up in the existing
-- Deductions report and Spend/Intacct export for free -- see
-- useDeductions.js for the driver-type override this column lets that
-- hook bypass for mid-trip-sourced work orders specifically.

alter table app_settings add column if not exists midtrip_chargeback_amount numeric(10, 2) not null default 30.00;

alter table work_orders add column if not exists mid_trip_inspection_id uuid references mid_trip_inspections(id) on delete set null;
