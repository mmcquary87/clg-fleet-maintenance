-- Driver Accountability Center — point/family corrections (CLG direction,
-- reviewed against the Before vs After workbook, 2026-11-09)
--
-- Three changes, each called out in the workbook's "Addl Changes" column:
--
-- 1. Missing Driver Certification belongs under Hours of Service, not Form &
--    Manner -- it was only grouped there by 20261103000000 alongside Missing
--    Shipping ID's / Missing Trailer Name(s) / DVIR Defect Not Reported.
--    CLG now wants it split back out into its own family and bumped to 1
--    point (was 0.5). This is a catalog/display change only -- it already
--    flows into driver_safety_scorecard's hos_points bucket via its
--    hos_description pattern in accountability_infraction_patterns
--    (20261029000000), not via violation_family, so no view change is
--    needed. It does change which infractions count toward the same
--    accountability_suggested_coaching_stage escalation (now groups with
--    Missed Rest Break/Shift Driving Limit/Cycle Limit/Shift Duty Limit
--    instead of the other three Form & Manner items) -- intended per CLG.
--
-- 2. Severe Speeding: 1.75 -> 2 points. CLG's rationale: only one severe
--    speeding event in the past 90 days, so the impact of rounding up is
--    minimal.
--
-- 3. Crash: stop counting toward the Driver Score (counts_toward_score =
--    false) but keep it reportable and fine-eligible -- those are untouched
--    by this flag (driver_incident_detail.fine_eligibility is computed
--    independently in 20261028040000, not from counts_toward_score; the
--    flag only gates the scorecard's point sums per 20261029000000).

update accountability_infractions
  set violation_family = 'Hours of Service', points = 1
  where name = 'Missing Driver Certification';

update accountability_infractions
  set points = 2
  where name = 'Severe Speeding';

update accountability_infractions
  set counts_toward_score = false
  where name = 'Crash';
