-- Fleet Maintenance System — chargeback deduction tracking
--
-- The Deductions report (DeductionsView.jsx) lists every non-voided
-- chargeback work order every time it's viewed, with no way to mark one
-- as already deducted from the driver's pay -- so a payroll run that
-- already handled a chargeback would show it again next time, with
-- nothing distinguishing "still needs to be deducted" from "already
-- done". Mirrors the existing payment_status/paid_at pattern
-- (work_orders already tracks whether an invoice's been paid the same
-- way) rather than inventing a new shape.

alter table work_orders add column chargeback_deducted_at timestamptz;
