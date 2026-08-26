-- Fleet Maintenance System — EXAMPLE data, not for the real project
--
-- The 6 real, manually-verified work orders from SPEC_1.md's invoice
-- proof-of-concept (Love's/Speedco + River City Truck Center, all billed to
-- CLG Transportation, LLC), kept here only as a reference dataset for
-- exercising the dashboard and invoice scanner during development. Real
-- fleet records get entered through the app once it's built, not loaded
-- via this file — do not run this against the live/shared project.
--
-- NOTE on unit "type": the source invoices didn't always state Truck vs
-- Trailer explicitly. Types below are best-guess from context (e.g. "Roadside
-- trailer tire blowout" -> Trailer) and should be corrected against the real
-- Alvys unit records rather than trusted as-is.

insert into units (number, type) values
  ('100143', 'Trailer'),  -- "Roadside trailer tire blowout" — explicit
  ('30323',  'Truck'),    -- linked-tractor field pointed at itself in source data
  ('012042', 'Trailer'),  -- guess — not stated in source, verify against Alvys
  ('448353', 'Trailer'),  -- trailer body + DOT inspection work
  ('33046',  'Truck'),    -- guess — not stated in source, verify against Alvys
  ('3419',   'Truck');    -- DPF/injector/engine work — tractor-specific systems

insert into vendors (name, specialty_category) values
  ('Speedco — Brunswick, GA', 'Tires'),
  ('Love''s TruckCare — Calhoun, GA', 'Tires'),
  ('Love''s #00470 — Jasper, FL', 'Tires'),
  ('Love''s #00802 — Milton, FL', 'Trailer / Body'),
  ('Speedco — Jackson, GA', 'Tires'),
  ('River City Truck Center — Jacksonville, FL', 'Engine');

insert into work_orders (unit_id, category, vendor_id, description, cost, status, date_opened, date_closed, invoice_ref, source)
select u.id, wo.category::wo_category, v.id, wo.description, wo.cost, 'Closed', wo.date_opened::date, wo.date_closed::date, wo.invoice_ref, 'manual'
from (values
  ('100143', 'Tires',          'Speedco — Brunswick, GA',                     'Roadside trailer tire blowout',                              722.99,   '2026-08-26', '2026-08-26', '4010677669'),
  ('30323',  'Tires',          'Love''s TruckCare — Calhoun, GA',             'In-shop tire replacement',                                   359.89,   '2026-08-26', '2026-08-26', '4010672514'),
  ('012042', 'Tires',          'Love''s #00470 — Jasper, FL',                 'Roadside tire replacement — sidewall damage',                742.72,   '2026-08-26', '2026-08-26', '4010679779'),
  ('448353', 'Trailer / Body', 'Love''s #00802 — Milton, FL',                 'Mud flap + bracket repair, DOT inspection',                  339.37,   '2026-08-26', '2026-08-26', '4010678501'),
  ('33046',  'Tires',          'Speedco — Jackson, GA',                       'In-shop tire replacement (tire separation)',                 652.38,   '2026-08-26', '2026-08-26', '4010685207'),
  ('3419',   'Engine',         'River City Truck Center — Jacksonville, FL',  'DPF + soot sensor + injector powerpack replacement (warranty mentioned in notes, not applied — see SPEC_1.md warranty-recovery flag)', 10612.57, '2026-08-24', '2026-08-24', 'RO 5383'),
  ('3419',   'PM / Oil',       'River City Truck Center — Jacksonville, FL',  'PM service — oil, filters, grease',                          892.20,   '2026-08-24', '2026-08-24', 'RO 5383'),
  ('3419',   'Electrical',     'River City Truck Center — Jacksonville, FL',  'Headlight harness inspection',                               42.00,    '2026-08-24', '2026-08-24', 'RO 5383'),
  ('3419',   'Trailer / Body', 'River City Truck Center — Jacksonville, FL',  'Quarter fender repair — labor',                              140.00,   '2026-08-24', '2026-08-24', 'RO 5383'),
  ('3419',   'Electrical',     'River City Truck Center — Jacksonville, FL',  'ABS light diag — brake pressure switch code',                140.00,   '2026-08-24', '2026-08-24', 'RO 5383'),
  ('3419',   'Other',          'River City Truck Center — Jacksonville, FL',  '3-axle alignment',                                            300.00,   '2026-08-24', '2026-08-24', 'RO 5383'),
  ('3419',   'Other',          'River City Truck Center — Jacksonville, FL',  'Shop supplies, tax, card fee (invoice-level)',               1634.94,  '2026-08-24', '2026-08-24', 'RO 5383')
) as wo(unit_number, category, vendor_name, description, cost, date_opened, date_closed, invoice_ref)
join units u on u.number = wo.unit_number
join vendors v on v.name = wo.vendor_name;
