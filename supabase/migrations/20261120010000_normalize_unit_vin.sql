-- Fleet Maintenance System — strip stray whitespace from units.vin (2026-11-20)
--
-- Alvys hands back VINs padded with trailing spaces (some with tabs/non-breaking
-- spaces, up to ~10 extra characters). samsara-sync links a unit to its Samsara
-- vehicle/trailer by an exact (case-insensitive) VIN compare, so every unit with
-- a padded VIN silently never linked: 8 active trucks (0856, 2110, 3389, 3419,
-- 3435, 4920, 6936, 7131) and 5 trailers. An unlinked unit's speeding intervals
-- are never fetched by samsara-sync-driver-safety (it only asks Samsara about
-- units that have a samsara_vehicle_id), so those trucks' speeding was missing
-- from driver scorecards entirely. Found 2026-11-20 from a Heavy Speeding
-- event (+21 mph, 2026-11-12 7:28 AM EST, truck 3389, driver Michael Dwight)
-- that was missing from the scorecard.
--
-- Fixed at the source rather than in each writer: a BEFORE trigger normalizes
-- units.vin on every insert/update, so alvys-sync-equipment (which re-writes the
-- raw Alvys VIN every 6 hours) can't re-introduce the padding. Then a one-time
-- cleanup of the rows already padded. samsara-sync (every 15 minutes) links the
-- cleaned units on its next run.
--
-- BACK OUT: drop trigger units_normalize_vin on units;
--           drop function normalize_unit_vin();
-- (the cleaned VINs themselves are an improvement and are not restored.)

create or replace function normalize_unit_vin()
returns trigger as $$
begin
  if new.vin is not null then
    new.vin := nullif(regexp_replace(new.vin, '\s', '', 'g'), '');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger units_normalize_vin
  before insert or update of vin on units
  for each row execute function normalize_unit_vin();

-- One-time cleanup of existing padded VINs (fires the trigger above).
update units set vin = vin where vin ~ '\s';
