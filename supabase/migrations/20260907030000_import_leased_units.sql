-- Fleet Maintenance System — import Penske/Hale leased equipment into units
--
-- Units page redesign, phase 1 (data model). The 9 Penske long-term-lease
-- trucks and 60 Hale-leased trailers seeded into the standalone
-- leased_equipment_values table (20260906040000) had no link to units at
-- all -- they didn't show up in the Units list, couldn't be opened, and
-- couldn't accumulate work-order/DVIR/fault-code history. This brings
-- them in as real units rows (ownership = penske_lease/hale_lease) so
-- they're first-class from here on. leased_equipment_values itself is
-- left in place for now as a record of the original import, not read by
-- the app anymore once InsuranceView is updated to query units directly.
--
-- 3 Hale trailer rows are deliberately EXCLUDED from this import: source
-- labels '395168' and '395169' carry the note "Shows CLG Owns" and
-- '395173' carries "CLG Own???" -- the workbook itself is unsure whether
-- these are actually already-owned CLG equipment rather than Hale-leased,
-- and importing them as leased could create a duplicate of an existing
-- CLG-owned unit. Confirmed by CLG (2026-09-07) to leave these 3 out
-- until that's resolved separately.
--
-- number: prefixed PK-/HL- + the lessor's own numeric identifier (or the
-- CLG-side number where the source data ties one to a specific CLG
-- number, e.g. "CLG #013114 Hale # 13114" -> HL-13114) -- this guarantees
-- no collision with CLG's own unit numbering (units.number is unique) and
-- keeps ownership visible at a glance everywhere number is displayed
-- (search, cards, drawer), not just wherever the ownership column/badge
-- is explicitly shown.
--
-- lease_reference keeps the full raw label from the source workbook for
-- traceability. lease_status_note surfaces two kinds of source-data
-- caveats verbatim rather than silently resolving them: a VIN the
-- workbook itself flags as disputed/uncertain (e.g. "HALE VIN shows
-- 3H3V532K2PJ034069"), and the 2 trailers ('28165', '29503') the
-- workbook marks "to be removed" -- left active here (not hidden/
-- deactivated) since there's no confirmation they're actually gone yet.
--
-- type/model: Penske trucks get type 'Truck' / model 'Sleeper Tractor'
-- (all 9 are over-the-road tractors per the source sheet); Hale trailers
-- get type 'Trailer' / model from the source sheet ('Dry Van' for all but
-- the one Fontaine flatbed, 'Flat/Sheffield').

insert into units (number, type, ownership, year, make, model, vin, current_market_value, current_market_value_date, lease_reference, lease_status_note) values
  ('PK-465185', 'Truck', 'penske_lease', 2023, 'Volvo', 'Sleeper Tractor', '4V4NC9EH9PN320158', 94768, '2026-07-01', '465185 / 0158', null),
  ('PK-585465', 'Truck', 'penske_lease', 2023, 'Volvo', 'Sleeper Tractor', '4V4NC9EH8PN330180', 94768, '2026-07-01', '585465 / 0180', null),
  ('PK-588106', 'Truck', 'penske_lease', 2023, 'Volvo', 'Sleeper Tractor', '4V4NC9EH0PN329718', 94768, '2026-07-01', '588106 / 9718', null),
  ('PK-588230', 'Truck', 'penske_lease', 2023, 'Volvo', 'Sleeper Tractor', '4V4NC9EH1PN329842', 94768, '2026-07-01', '588230 /9842', null),
  ('PK-385468', 'Truck', 'penske_lease', 2022, 'Freightliner', 'Sleeper Tractor', '3AKJHHDR4NSMT0587', 75725, '2026-07-01', '385468 / 0587', null),
  ('PK-464153', 'Truck', 'penske_lease', 2022, 'Freightliner', 'Sleeper Tractor', '3AKJHHDR0NSNF2424', 75725, '2026-07-01', '464153 / 2424', null),
  ('PK-438528', 'Truck', 'penske_lease', 2022, 'Freightliner', 'Sleeper Tractor', '3AKJHHDR0NSNK9021', 77186, '2026-07-01', '438528 / 9021', null),
  ('PK-386950', 'Truck', 'penske_lease', 2022, 'Volvo', 'Sleeper Tractor', '4V4NC9EHXNN289435', 72052, '2026-07-01', '386950 / 9435', null),
  ('PK-469798', 'Truck', 'penske_lease', 2023, 'Volvo', 'Sleeper Tractor', '4V4NC9EH9PN333847', 96921, '2026-07-01', '469798 / 3847', null),
  ('HL-28106', 'Trailer', 'hale_lease', 2013, 'Hyundai', 'Dry Van', '3H3V532C3DT139096', 18900, '2026-08-01', '28106', null),
  ('HL-28165', 'Trailer', 'hale_lease', 2014, 'Hyundai', 'Dry Van', '3H3V532C5ET029152', 20300, '2026-08-01', '28165 To be reomved', 'Source workbook marked this unit "to be removed" -- confirm still active with Hale before relying on this row.'),
  ('HL-29503', 'Trailer', 'hale_lease', 2015, 'Hyundai', 'Dry Van', '3H3V532C1FT281076', 22200, '2026-08-01', '29503 to be reomved', 'Source workbook marked this unit "to be removed" -- confirm still active with Hale before relying on this row.'),
  ('HL-29915', 'Trailer', 'hale_lease', 2015, 'Hyundai', 'Dry Van', '3H3V532C9FT286140', 22200, '2026-08-01', '29915', null),
  ('HL-30315', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C1GT041026', 23900, '2026-08-01', '30315', null),
  ('HL-30327', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C2GT044064', 23900, '2026-08-01', '30327', null),
  ('HL-30364', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C4GT041036', 23900, '2026-08-01', '30364', null),
  ('HL-31049', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C6GT348028', 23900, '2026-08-01', '31049', null),
  ('HL-30462', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C7GT044061', 23900, '2026-08-01', '30462', null),
  ('HL-30944', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C7GT348037', 23900, '2026-08-01', '30944', null),
  ('HL-32656', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532C7GT451023', 23900, '2026-08-01', '32656', null),
  ('HL-30323', 'Trailer', 'hale_lease', 2016, 'Hyundai', 'Dry Van', '3H3V532CXGT044023', 23900, '2026-08-01', '30323', null),
  ('HL-31994', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C0HT253028', 26050, '2026-08-01', '31994', null),
  ('HL-34537', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C0HT645023', 26050, '2026-08-01', '34537', null),
  ('HL-34485', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C1HT253412', 26050, '2026-08-01', '34485', null),
  ('HL-32565', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C2HT180017', 26050, '2026-08-01', '32565', null),
  ('HL-32933', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C2HT253340', 26050, '2026-08-01', '32933', null),
  ('HL-33046', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C3HT253346', 26050, '2026-08-01', '33046', null),
  ('HL-34496', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C4HT645011', 26050, '2026-08-01', '34496', null),
  ('HL-34487', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C5HT253414', 26050, '2026-08-01', '34487', null),
  ('HL-32574', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C6HT253177', 26050, '2026-08-01', '32574', null),
  ('HL-34497', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C6HT645012', 26050, '2026-08-01', '34497', null),
  ('HL-33044', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C7HT253334', 26050, '2026-08-01', '33044', null),
  ('HL-32929', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C7HT450097', 26050, '2026-08-01', '32929', null),
  ('HL-34744', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C7HT645018', 26050, '2026-08-01', '34744', null),
  ('HL-32795', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C7HT646010', 26050, '2026-08-01', '32795', null),
  ('HL-34502', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532C9HT645019', 26050, '2026-08-01', '34502', null),
  ('HL-32569', 'Trailer', 'hale_lease', 2017, 'Hyundai', 'Dry Van', '3H3V532CXHT450093', 26050, '2026-08-01', '32569', null),
  ('HL-34576', 'Trailer', 'hale_lease', 2018, 'Hyundai', 'Dry Van', '3H3V532C3JR097022', 27700, '2026-08-01', '34576', null),
  ('HL-34918', 'Trailer', 'hale_lease', 2018, 'Hyundai', 'Dry Van', '3H3V532C3JR742011', 27700, '2026-08-01', 'CLG #034918 Hale # 34918', null),
  ('HL-34920', 'Trailer', 'hale_lease', 2018, 'Hyundai', 'Dry Van', '3H3V532C4JR742034', 27700, '2026-08-01', '34920', null),
  ('HL-34917', 'Trailer', 'hale_lease', 2018, 'Hyundai', 'Dry Van', '3H3V532C6JR097029', 27700, '2026-08-01', '34917', null),
  ('HL-34879', 'Trailer', 'hale_lease', 2018, 'Hyundai', 'Dry Van', '3H3V532C8JR712082', 27700, '2026-08-01', '34879', null),
  ('HL-34914', 'Trailer', 'hale_lease', 2018, 'Hyundai', 'Dry Van', '3H3V532C9JR097025', 27700, '2026-08-01', '34914', null),
  ('HL-35571', 'Trailer', 'hale_lease', 2019, 'Hyundai', 'Dry Van', '3H3V532C1KR341090', 29800, '2026-08-01', '35571', null),
  ('HL-36094', 'Trailer', 'hale_lease', 2019, 'Hyundai', 'Dry Van', '3H3V532C1KR803115', 29800, '2026-08-01', '36094', null),
  ('HL-35570', 'Trailer', 'hale_lease', 2019, 'Hyundai', 'Dry Van', '3H3V532C3KR341088', 29800, '2026-08-01', '35570', null),
  ('HL-36096', 'Trailer', 'hale_lease', 2019, 'Hyundai', 'Dry Van', '3H3V532C5KR803117', 28000, '2026-08-01', '36096', null),
  ('HL-35696', 'Trailer', 'hale_lease', 2019, 'Hyundai', 'Dry Van', '3H3V532C9KR341080', 29800, '2026-08-01', '35696', null),
  ('HL-13114', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532C2LR013114', 36900, '2026-08-01', 'CLG #013114 Hale # 13114', null),
  ('HL-12037', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532C5LR012037', 36900, '2026-08-01', '012037 Hale # 12037', null),
  ('HL-38178', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532C5LR394148', 32800, '2026-08-01', '38178', null),
  ('HL-38182', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532C5LR395171', 32800, '2026-08-01', '38182', null),
  ('HL-38181', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532C8LR013098', 32800, '2026-08-01', '38181', null),
  ('HL-13068', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532CXLR013068', 32800, '2026-08-01', 'CLG #013068 Hale #13068', null),
  ('HL-A008969', 'Trailer', 'hale_lease', 2023, 'Hyundai', 'Dry Van', '3H3V532K1PJ034029', 42500, '2026-08-01', 'A008969', 'HALE VIN shows 3H3V532K2PJ034069'),
  ('HL-A009525', 'Trailer', 'hale_lease', 2023, 'Hyundai', 'Dry Van', '3H3V532K9PS036346', 40500, '2026-08-01', 'A009525', null),
  ('HL-A016435', 'Trailer', 'hale_lease', 2020, 'Hyundai', 'Dry Van', '3H3V532K4RJ173011', 42500, '2026-08-01', 'A016435', 'Hale Shows 20234'),
  ('HL-A016449', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K4RJ173025', 42500, '2026-08-01', 'A016449', null),
  ('HL-73017', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K5RJ173017', 42500, '2026-08-01', '73017 16441 A016441', null),
  ('HL-73026', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K6RJ173026', 42500, '2026-08-01', '73026 16450 A016450', null),
  ('HL-73018', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K7RJ173018', 42500, '2026-08-01', '73018 16442 A016442', null),
  ('HL-73021', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K7RJ173021', 42500, '2026-08-01', '73021 16445 A016445', null),
  ('HL-A016451', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K8RJ173027', 42500, '2026-08-01', 'A016451', null),
  ('HL-73030', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532K8RJ173030', 42500, '2026-08-01', '73030 16454 A016454', null),
  ('HL-A016452', 'Trailer', 'hale_lease', 2024, 'Hyundai', 'Dry Van', '3H3V532KXRJ173028', 42500, '2026-08-01', 'A016452', null),
  ('HL-A036178', 'Trailer', 'hale_lease', 2027, 'Fontaine', 'Flat/Sheffield', '13N1532C7V1584098', 50500, '2026-08-01', 'A036178', null);
