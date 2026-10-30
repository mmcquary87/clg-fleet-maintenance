-- Fleet Maintenance System — plate state/country columns on units
--
-- units.plate_number / plate_expires_at already existed (20260907020000)
-- as manual-entry-only fields -- nothing ever synced them from Alvys.
-- Confirmed via alvys-explore-plate-registration (2026-10-30) that Alvys's
-- trucks/trailers search API carries plate data as real structured fields
-- (LicenseNum, LicenseState, LicenseCountry, LicenseExpirationDate on
-- trucks -- trailers in the sampled fleet had the first three but not
-- LicenseExpirationDate), not just an uploaded document. plate_state is
-- worth keeping (useful for a multi-state fleet tracking renewal
-- deadlines); plate_country is included for completeness since Alvys
-- already provides it alongside, even though it's "US" fleet-wide today.
alter table units add column if not exists plate_state text;
alter table units add column if not exists plate_country text;
