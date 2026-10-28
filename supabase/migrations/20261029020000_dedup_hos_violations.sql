-- Driver Safety / Accountability — foundational rebuild, Phase 4
--
-- driver_hos_violations' id ("samsara_driver_id:violation_start_time:type",
-- 20261007000000) multiplied a single ongoing violation into a new row on
-- every 15-minute sync poll instead of updating one: Samsara re-stamps
-- violationStartTime to "now" each time it re-reports a still-active
-- condition. Confirmed against real data (2026-10-28): one driver had 14
-- "Missing Driver Certification" rows for the same day_start/day_end, their
-- violation_start_time values exactly 15 minutes apart, matching this
-- sync's own cron cadence exactly. samsara-sync-driver-safety/index.ts now
-- keys on (samsara_driver_id, day.startTime, type) instead, which is stable
-- across repeated polls of the same ongoing violation.
--
-- This isn't just a cosmetic row-count issue: driver_safety_scorecard sums
-- points per ROW, not per distinct violation. An admin/paperwork type
-- (Missing Driver Certification/Shipping ID/Trailer Name) is excluded from
-- scoring either way, but the SAME bug could have multiplied a SCORED
-- category (Missed Rest Break, Shift Driving/Cycle/Duty Limit) the same
-- way for any driver with an ongoing one of those -- silently inflating
-- their HOS point total for as long as the real condition stayed active.
--
-- One-time cleanup: collapse existing duplicates to one row per
-- (samsara_driver_id, day_start, violation_type) -- keeping the latest
-- violation_start_time (the most recently reconfirmed state) -- then re-key
-- survivors to the new id scheme so the next sync run UPDATEs them instead
-- of inserting fresh duplicates under the new key.

with ranked as (
  select
    id,
    row_number() over (
      partition by samsara_driver_id, day_start, violation_type
      order by violation_start_time desc, synced_at desc
    ) as rn
  from driver_hos_violations
  where samsara_driver_id is not null and day_start is not null
)
delete from driver_hos_violations dhv
using ranked r
where dhv.id = r.id and r.rn > 1;

update driver_hos_violations
set id = samsara_driver_id || ':' || day_start::text || ':' || coalesce(violation_type, '')
where samsara_driver_id is not null and day_start is not null;
