-- Owner-Operator Recruiting — extend user_role for CRM step ownership
--
-- Run standalone: ALTER TYPE ... ADD VALUE can't share a transaction with
-- anything that uses the new value (same reason as
-- 20260908020000_wo_category_tow_enum_value.sql). The next migration
-- (20260927040000) uses these values in seeded onboarding template steps,
-- so this one must be applied and committed first, on its own.

alter type user_role add value 'safety';
alter type user_role add value 'operations';
alter type user_role add value 'finance';
alter type user_role add value 'viewer';
