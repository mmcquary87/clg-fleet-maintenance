-- Fleet Maintenance System — Alvys load number on the Tracking page
--
-- unit_current_trip only stored alvys_trip_id (Alvys's internal trip GUID)
-- — not usable for a dispatcher to look a load up in Alvys itself. Confirmed
-- via alvys-explore-active-trips that trips/search returns LoadNumber
-- directly on the trip object (distinct from TripNumber, which can carry a
-- leg suffix like "1012475-1" for a multi-stop load's individual legs while
-- LoadNumber stays the stable "1012475" reference).

alter table unit_current_trip add column load_number text;
