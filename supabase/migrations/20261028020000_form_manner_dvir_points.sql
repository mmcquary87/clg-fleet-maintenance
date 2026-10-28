-- Driver Accountability Center — correct Form & Manner points, add DVIR
-- (CLG direction, 2026-10-28)
--
-- "Missing Shipping ID's" and "Missing Trailer Name(s)" (violation_family
-- 'Form & Manner') were seeded verbatim from the Excel workbook at 0.5
-- points/$25 fine (20261007060000_driver_accountability.sql). Corrected
-- to 0.25 points -- fine stays $25 (points and fine aren't meant to move
-- together here, unlike the new DVIR entry below).
update accountability_infractions
  set points = 0.25
  where name in ('Missing Shipping ID''s', 'Missing Trailer Name(s)');

-- DVIR wasn't in the catalog at all -- a DVIR defect a driver fails to
-- report never produced an accountability point before this. New entry,
-- same Minor tier as Form & Manner, 0.25 points / $25 fine.
insert into accountability_infractions (name, violation_family, severity, points, rollover_days, fine_amount)
values ('DVIR Defect Not Reported', 'DVIR', 'Minor', 0.25, 60, 25);
