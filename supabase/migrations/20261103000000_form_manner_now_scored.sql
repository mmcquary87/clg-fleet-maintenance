-- Driver Accountability Center — Form & Manner now counts toward the score
-- (CLG direction, 2026-11-03)
--
-- Missing Driver Certification, Missing Shipping ID's, Missing Trailer
-- Name(s), and DVIR Defect Not Reported were excluded from the Driver Score
-- by 20261029000000 (paperwork categories were previously flooding the HOS
-- score via Samsara's hos_description auto-detection -- 20261014030000's
-- "paperwork-saturation" fix) and DVIR Defect Not Reported was added
-- manual-only/never-scored by 20261028020000, per Dvir.jsx's "DVIR defects
-- never affect a driver's score". CLG now wants all four treated as one
-- scored Form & Manner category instead.
--
-- Two changes:
--   1. Group all four under violation_family = 'Form & Manner' (Missing
--      Shipping ID's / Missing Trailer Name(s) already were; Missing Driver
--      Certification moves from 'Log Certification/App Usage', DVIR Defect
--      Not Reported moves from 'DVIR'). This also changes which infractions
--      count together for accountability_suggested_coaching_stage's
--      same-family count (20261029010000) -- a driver's Missing Shipping
--      ID's and DVIR Defect Not Reported now combine toward the same
--      suggested coaching stage.
--   2. Set counts_toward_score = true for all four. Missing Driver
--      Certification / Missing Shipping ID's / Missing Trailer Name(s) have
--      existing hos_description patterns (20261029000000), so they start
--      flowing into driver_safety_scorecard's hos_points the moment this
--      runs -- same join, no view change needed. DVIR Defect Not Reported
--      has no auto-detection pattern (manual-only via driver_incidents), so
--      it instead flows through the view's manual_hos_points CTE, same
--      path PC Misuse/Yard Move Misuse already use.
--
-- Point values are untouched (Missing Driver Certification stays 0.5;
-- the other three stay 0.25) -- CLG didn't ask to equalize them, only to
-- group and score them.
update accountability_infractions
  set violation_family = 'Form & Manner'
  where name in ('Missing Driver Certification', 'DVIR Defect Not Reported');

update accountability_infractions
  set counts_toward_score = true
  where name in (
    'Missing Driver Certification',
    'Missing Shipping ID''s',
    'Missing Trailer Name(s)',
    'DVIR Defect Not Reported'
  );
