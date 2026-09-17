-- Fleet Maintenance System — backfill missing mid-trip fee work orders
-- (2026-09-18)
--
-- Before 20260918 (the "always record the mid-trip fee, not just on
-- chargeback" fix in MidTripInspectionForm.jsx's save()), a filed mid-trip
-- inspection only got a fee work order when "Charge back to driver" was
-- checked -- one that wasn't charged back recorded no cost anywhere,
-- which Spend/Cost-per-mile reporting silently missed (unit 5111's
-- passed mid-trip was the reported case). This is a one-time backfill for
-- every already-filed inspection still missing its fee work order --
-- new filings are unaffected, already covered by that fix.
--
-- Only backfills as non-chargeback (is_chargeback = false): the only
-- reason no work order exists yet is that the mechanic didn't check
-- "Charge back to driver" at filing time, so that's the accurate original
-- intent to preserve, not a guess. Uses today's app_settings flat fee for
-- every backfilled row -- the fee's actual value at each inspection's
-- original filing date was never recorded anywhere to backfill instead.
insert into work_orders (
  unit_id, category, description, cost, status, date_opened, date_closed,
  intake_source, source, is_chargeback, mid_trip_inspection_id
)
select
  mti.unit_id,
  'Mid-Trip Inspection',
  'Mid-trip inspection fee',
  coalesce((select midtrip_chargeback_amount from app_settings limit 1), 0),
  'Closed',
  mti.inspected_at,
  mti.inspected_at,
  'manual',
  'manual',
  false,
  mti.id
from mid_trip_inspections mti
where mti.status = 'filed'
  and not exists (
    select 1 from work_orders wo where wo.mid_trip_inspection_id = mti.id
  );
