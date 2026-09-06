-- Fleet Maintenance System — Penske and Hale leased equipment values
--
-- Real per-unit values from CLG's own "CLG Monthly Equipment & Insurance
-- Reporter" workbook: 9 long-term Penske lease trucks (Trucks sheet, "L/T
-- Lease Units Penske" rows) and 60 Hale-leased trailers (Trailers sheet,
-- "HALE Trailers" section). Kept in a separate table from units.
-- current_market_value (20260906030000) rather than reusing it -- most
-- Hale trailers use Hale's own numbering with no CLG unit-number
-- counterpart in `units`, and conflating leased-in value with CLG's own
-- owned-equipment value would misstate what the Physical Damage premium
-- is actually rated on (CLG-owned equipment only, per the workbook's own
-- stated scope -- Penske/Hale equipment is ordinarily insured under the
-- lessor's own policy, not CLG's).
--
-- No depreciation is modeled for either category (unlike CLG-owned
-- trucks/trailers): both sheets show a periodic reviewed/updated value
-- ("Value Changed Eff 07/01/2026" for Penske, "Effective 08/01/2026" for
-- Hale) rather than a monthly compounding schedule, so current_value is
-- read as a flat stated value, not projected forward.
--
-- Short-term Penske rental substitutes (the "TEMP UNITS" log used while a
-- CLG truck is in the shop) and owner-operator units are intentionally
-- excluded -- neither carries a clean per-unit dollar value in the source
-- workbook, and both are transient, not a stable equipment holding.
--
-- Note: the workbook's own "Stated Value"/"Total Stated Value" cells for
-- both the Hale and CLG trailer sections show the identical $1,422,500 --
-- almost certainly a stale copy/paste in the workbook itself, not a real
-- total for either pool. The sums used here are computed directly from
-- each row's own value column instead.

create type equipment_ownership as enum ('penske_lease', 'hale_lease');

create table if not exists leased_equipment_values (
  id uuid primary key default gen_random_uuid(),
  ownership equipment_ownership not null,
  unit_label text not null, -- Penske/Hale's own identifier, e.g. "588106 / 9718" or "28106" -- not necessarily a units.number match
  year integer,
  make text,
  model text,
  vin text,
  current_value numeric(10, 2) not null,
  current_value_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_leased_equipment_values_ownership on leased_equipment_values(ownership);

alter table leased_equipment_values enable row level security;
create policy "authenticated_all_leased_equipment_values" on leased_equipment_values
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Penske long-term lease trucks (from the workbook's Trucks sheet, 'L/T Lease Units Penske' rows)
insert into leased_equipment_values (ownership, unit_label, year, make, model, vin, current_value, current_value_date) values
  ('penske_lease', '465185 / 0158', 2023, 'Volvo', 'L/T Lease Units Penske 465185', '4V4NC9EH9PN320158', 94768, '2026-07-01'),
  ('penske_lease', '585465 / 0180', 2023, 'Volvo', 'L/T Lease Units Penske 585465 Suggs', '4V4NC9EH8PN330180', 94768, '2026-07-01'),
  ('penske_lease', '588106 / 9718', 2023, 'Volvo', 'L/T Lease Units Penske 588106', '4V4NC9EH0PN329718', 94768, '2026-07-01'),
  ('penske_lease', '588230 /9842', 2023, 'Volvo', 'L/T Lease Units Penske 588230 -', '4V4NC9EH1PN329842', 94768, '2026-07-01'),
  ('penske_lease', '385468 / 0587', 2022, 'Freightliner', 'L/T Penske Unit 385468 -', '3AKJHHDR4NSMT0587', 75725, '2026-07-01'),
  ('penske_lease', '464153 / 2424', 2022, 'Freightliner', 'L/T Penske Unit 464153 - Behrens', '3AKJHHDR0NSNF2424', 75725, '2026-07-01'),
  ('penske_lease', '438528 / 9021', 2022, 'Freightliner', 'L/T Penske Unit 438528', '3AKJHHDR0NSNK9021', 77186, '2026-07-01'),
  ('penske_lease', '386950 / 9435', 2022, 'Volvo', 'L/T Penske Unit 386950', '4V4NC9EHXNN289435', 72052, '2026-07-01'),
  ('penske_lease', '469798 / 3847', 2023, 'Volvo', 'L/T Penske Unit - 469798 Vernon - 3847', '4V4NC9EH9PN333847', 96921, '2026-07-01');

-- Hale-leased trailers (from the workbook's Trailers sheet, 'HALE Trailers' section)
insert into leased_equipment_values (ownership, unit_label, year, make, model, vin, current_value, current_value_date) values
  ('hale_lease', '28106', 2013, 'Hyundai', 'Hale - Dry Van', '3H3V532C3DT139096', 18900, '2026-08-01'),
  ('hale_lease', '28165 To be reomved', 2014, 'Hyundai', 'Hale - Dry Van', '3H3V532C5ET029152', 20300, '2026-08-01'),
  ('hale_lease', '29503 to be reomved', 2015, 'Hyundai', 'Hale - Dry Van', '3H3V532C1FT281076', 22200, '2026-08-01'),
  ('hale_lease', '29915', 2015, 'Hyundai', 'Hale - Dry Van', '3H3V532C9FT286140', 22200, '2026-08-01'),
  ('hale_lease', '30315', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C1GT041026', 23900, '2026-08-01'),
  ('hale_lease', '30327', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C2GT044064', 23900, '2026-08-01'),
  ('hale_lease', '30364', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C4GT041036', 23900, '2026-08-01'),
  ('hale_lease', '31049', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C6GT348028', 23900, '2026-08-01'),
  ('hale_lease', '30462', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C7GT044061', 23900, '2026-08-01'),
  ('hale_lease', '30944', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C7GT348037', 23900, '2026-08-01'),
  ('hale_lease', '32656', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532C7GT451023', 23900, '2026-08-01'),
  ('hale_lease', '30323', 2016, 'Hyundai', 'Hale - Dry Van', '3H3V532CXGT044023', 23900, '2026-08-01'),
  ('hale_lease', '31994', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C0HT253028', 26050, '2026-08-01'),
  ('hale_lease', '34537', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C0HT645023', 26050, '2026-08-01'),
  ('hale_lease', '34485', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C1HT253412', 26050, '2026-08-01'),
  ('hale_lease', '32565', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C2HT180017', 26050, '2026-08-01'),
  ('hale_lease', '32933', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C2HT253340', 26050, '2026-08-01'),
  ('hale_lease', '33046', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C3HT253346', 26050, '2026-08-01'),
  ('hale_lease', '34496', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C4HT645011', 26050, '2026-08-01'),
  ('hale_lease', '34487', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C5HT253414', 26050, '2026-08-01'),
  ('hale_lease', '32574', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C6HT253177', 26050, '2026-08-01'),
  ('hale_lease', '34497', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C6HT645012', 26050, '2026-08-01'),
  ('hale_lease', '33044', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C7HT253334', 26050, '2026-08-01'),
  ('hale_lease', '32929', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C7HT450097', 26050, '2026-08-01'),
  ('hale_lease', '34744', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C7HT645018', 26050, '2026-08-01'),
  ('hale_lease', '32795', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C7HT646010', 26050, '2026-08-01'),
  ('hale_lease', '34502', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532C9HT645019', 26050, '2026-08-01'),
  ('hale_lease', '32569', 2017, 'Hyundai', 'Hale - Dry Van', '3H3V532CXHT450093', 26050, '2026-08-01'),
  ('hale_lease', '34576', 2018, 'Hyundai', 'Hale - Dry Van', '3H3V532C3JR097022', 27700, '2026-08-01'),
  ('hale_lease', 'CLG #034918 Hale # 34918', 2018, 'Hyundai', 'Hale - Dry Van', '3H3V532C3JR742011', 27700, '2026-08-01'),
  ('hale_lease', '34920', 2018, 'Hyundai', 'Hale - Dry Van', '3H3V532C4JR742034', 27700, '2026-08-01'),
  ('hale_lease', '34917', 2018, 'Hyundai', 'Hale - Dry Van', '3H3V532C6JR097029', 27700, '2026-08-01'),
  ('hale_lease', '34879', 2018, 'Hyundai', 'Hale - Dry Van', '3H3V532C8JR712082', 27700, '2026-08-01'),
  ('hale_lease', '34914', 2018, 'Hyundai', 'Hale - Dry Van', '3H3V532C9JR097025', 27700, '2026-08-01'),
  ('hale_lease', '35571', 2019, 'Hyundai', 'Hale - Dry Van', '3H3V532C1KR341090', 29800, '2026-08-01'),
  ('hale_lease', '36094', 2019, 'Hyundai', 'Hale - Dry Van', '3H3V532C1KR803115', 29800, '2026-08-01'),
  ('hale_lease', '35570', 2019, 'Hyundai', 'Hale - Dry Van', '3H3V532C3KR341088', 29800, '2026-08-01'),
  ('hale_lease', '36096', 2019, 'Hyundai', 'Hale - Dry Van', '3H3V532C5KR803117', 28000, '2026-08-01'),
  ('hale_lease', '35696', 2019, 'Hyundai', 'Hale - Dry Van', '3H3V532C9KR341080', 29800, '2026-08-01'),
  ('hale_lease', 'CLG #013114 Hale # 13114', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C2LR013114', 36900, '2026-08-01'),
  ('hale_lease', '012037 Hale # 12037', 2020, 'Hyundia', 'Hale - Dry Van', '3H3V532C5LR012037', 36900, '2026-08-01'),
  ('hale_lease', '38178', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C5LR394148', 32800, '2026-08-01'),
  ('hale_lease', '395168', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C5LR395168 Shows CLG Owns', 32800, '2026-08-01'),
  ('hale_lease', '38182', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C5LR395171', 32800, '2026-08-01'),
  ('hale_lease', '395169', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C7LR395169 Shows CLG Owns', 32800, '2026-08-01'),
  ('hale_lease', '38181', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C8LR013098', 32800, '2026-08-01'),
  ('hale_lease', '395173', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532C9LR395173 CLG Own???', 36900, '2026-08-01'),
  ('hale_lease', 'CLG #013068 Hale #13068', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532CXLR013068', 32800, '2026-08-01'),
  ('hale_lease', 'A008969', 2023, 'Hyundai', 'Hale - Dry Van', '3H3V532K1PJ034029 HALE VIN shows 3H3V532K2PJ034069', 42500, '2026-08-01'),
  ('hale_lease', 'A009525', 2023, 'Hyundia', 'Hale - Dry Van', '3H3V532K9PS036346', 40500, '2026-08-01'),
  ('hale_lease', 'A016435', 2020, 'Hyundai', 'Hale - Dry Van', '3H3V532K4RJ173011 Hale Shows 20234', 42500, '2026-08-01'),
  ('hale_lease', 'A016449', 2024, 'Hyundai', 'Hale - Dry Van', '3H3V532K4RJ173025', 42500, '2026-08-01'),
  ('hale_lease', '73017 16441 A016441', 2024, 'Hyundai Van', 'Hale - Dry Van', '3H3V532K5RJ173017', 42500, '2026-08-01'),
  ('hale_lease', '73026 16450 A016450', 2024, 'Hyundai Van', 'Hale - Dry Van', '3H3V532K6RJ173026', 42500, '2026-08-01'),
  ('hale_lease', '73018 16442 A016442', 2024, 'Hyundai Van', 'Hale - Dry Van', '3H3V532K7RJ173018', 42500, '2026-08-01'),
  ('hale_lease', '73021 16445 A016445', 2024, 'Hyundai Van', 'Hale - Dry Van', '3H3V532K7RJ173021', 42500, '2026-08-01'),
  ('hale_lease', 'A016451', 2024, 'Hyundai', 'Hale - Dry Van', '3H3V532K8RJ173027', 42500, '2026-08-01'),
  ('hale_lease', '73030 16454 A016454', 2024, 'Hyundai Van', 'Hale - Dry Van', '3H3V532K8RJ173030', 42500, '2026-08-01'),
  ('hale_lease', 'A016452', 2024, 'Hyundai', 'Hale - Dry Van', '3H3V532KXRJ173028', 42500, '2026-08-01'),
  ('hale_lease', 'A036178', 2027, 'Fontaine', 'Hale - Flat/Sheffield', '13N1532C7V1584098', 50500, '2026-08-01');