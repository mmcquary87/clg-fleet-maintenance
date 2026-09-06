-- Fleet Maintenance System — CLG-owned equipment market values (Physical
-- Damage insurance premium)
--
-- Imports the real current market values from CLG's own "CLG Monthly
-- Equipment & Insurance Reporter" workbook (as of August 31, 2026): each
-- CLG-owned truck's individually-assessed value + monthly depreciation
-- rate (from the workbook's "CLG Valuation History" sheet), and each
-- CLG-owned trailer's value (from "Market Value Update 08-31-26" --
-- trailers depreciate at one flat fleet-wide rate rather than a per-unit
-- one, matching that workbook's own Monthly Reporter formula). Penske
-- lease units and Hale-leased trailers are excluded from this valuation
-- by CLG's own stated policy (both workbook sheets say so explicitly) --
-- no rows below touch them, and neither is a match target for this data.
--
-- Feeds the Spend page's Insurance view: Physical Damage premium is rated
-- on total CLG-owned equipment value, not mileage -- unlike the Auto
-- Liability/Cargo lines added in 20260906020000_insurance_rates.sql.
--
-- Matches are by units.number (exact text match) against the workbook's
-- own unit numbers, with two known cleanups applied before matching:
-- trailing " - APU" notes stripped (e.g. "5237 - APU" -> "5237"), and
-- Excel-native numeric cells rendered as plain integers. A handful of
-- trailer numbers were entered inconsistently in the source workbook
-- itself (e.g. "12043" vs "012120" -- some with a leading zero, some
-- without) -- if the real unit number differs, that UPDATE simply matches
-- zero rows rather than erroring, so this is safe to run as-is; reconcile
-- any unmatched units by hand afterward if the Insurance view's fleet
-- total looks short.

alter table units add column if not exists current_market_value numeric(10, 2);
alter table units add column if not exists current_market_value_date date;
alter table units add column if not exists market_value_mom_depreciation_pct numeric(6, 5);

alter table app_settings add column if not exists insurance_trailer_depreciation_pct numeric(6, 5) not null default 0.005;
alter table app_settings add column if not exists insurance_physical_damage_rate_per_100 numeric(8, 3) not null default 0.171;

-- Truck valuations (per-unit monthly depreciation rate from CLG Valuation History)
update units set current_market_value = 66000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '2071';
update units set current_market_value = 66000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '2110';
update units set current_market_value = 66000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '4920';
update units set current_market_value = 66000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '4813';
update units set current_market_value = 52500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '5101';
update units set current_market_value = 55000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '5237';
update units set current_market_value = 55000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '5239';
update units set current_market_value = 41000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.009 where number = '0856';
update units set current_market_value = 52500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3389';
update units set current_market_value = 52500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '6936';
update units set current_market_value = 52500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '7131';
update units set current_market_value = 46000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3429';
update units set current_market_value = 46000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3435';
update units set current_market_value = 41000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.009 where number = '8619';
update units set current_market_value = 52500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3419';
update units set current_market_value = 15000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.005 where number = 'D3429';
update units set current_market_value = 45000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.0075 where number = '0094';
update units set current_market_value = 30000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.008 where number = '5111';
update units set current_market_value = 30000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.008 where number = '4933';
update units set current_market_value = 22500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.007 where number = '4212';
update units set current_market_value = 22500, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.007 where number = '5337';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3304';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3305';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3306';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3307';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3308';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3309';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3310';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3313';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3314';
update units set current_market_value = 64000, current_market_value_date = '2026-08-31', market_value_mom_depreciation_pct = 0.01 where number = '3303';

-- Trailer valuations (flat fleet-wide monthly depreciation rate, see app_settings.insurance_trailer_depreciation_pct)
update units set current_market_value = 10000, current_market_value_date = '2026-08-31' where number = '002583';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '038006';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '303041';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '038003';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '038020';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '303009';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '038004';
update units set current_market_value = 14000, current_market_value_date = '2026-08-31' where number = '038005';
update units set current_market_value = 15500, current_market_value_date = '2026-08-31' where number = '307014';
update units set current_market_value = 15500, current_market_value_date = '2026-08-31' where number = '087007';
update units set current_market_value = 15500, current_market_value_date = '2026-08-31' where number = '087005';
update units set current_market_value = 15500, current_market_value_date = '2026-08-31' where number = '307030';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '342117';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '342120';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '348003';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '872003';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '348004';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '342123';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '342115';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '348001';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '872001';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '348002';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '342111';
update units set current_market_value = 17500, current_market_value_date = '2026-08-31' where number = '872002';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '12043';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '12124';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '12044';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '012120';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '012045';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '012041';
update units set current_market_value = 20000, current_market_value_date = '2026-08-31' where number = '012042';
update units set current_market_value = 22500, current_market_value_date = '2026-08-31' where number = '307946';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100139';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100143';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100144';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100100';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100145';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100087';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100096';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100146';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100088';
update units set current_market_value = 26000, current_market_value_date = '2026-08-31' where number = '100147';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034006';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034001';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034007';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034002';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034008';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034003';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034009';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '448353';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034004';
update units set current_market_value = 29000, current_market_value_date = '2026-08-31' where number = '034005';