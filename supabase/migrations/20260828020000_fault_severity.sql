-- Fleet Maintenance System — fault code severity for the check-engine-light indicator
-- Run this in the Supabase SQL Editor after 20260828010000_samsara_support.sql.

-- 'red' (stop lamp / confirmed DTC with CEL on) > 'amber' (protect/emissions
-- lamp) > 'yellow' (warning lamp / pending DTC only) > null (informational,
-- no lamp signal — e.g. a permanent DTC with the light since cleared).
alter table fault_events add column light_severity text
  check (light_severity in ('red', 'amber', 'yellow'));
