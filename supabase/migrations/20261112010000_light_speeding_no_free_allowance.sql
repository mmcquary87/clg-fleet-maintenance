-- Fleet Maintenance System — light speeding: remove the free allowance
--
-- 20261111110000 seeded light_allowance_min_per_1k_miles = 100 (the first 100
-- minutes of light speeding per 1,000 miles cost nothing). Direction
-- (2026-11-12): a free band can be read as ignoring light speeding, which is
-- the opposite of why it is tracked (compliance/legal). With the allowance at 0
-- every minute of light speeding contributes, still capped at light_cap_points
-- (150) so volume cannot swamp the rest of the score. The ceiling stays at 150:
-- lowering it would have given the heaviest light-speeders a smaller penalty
-- than they have now.
--
-- Effect measured before applying: fleet average 59.7 -> 58.3; 29 of 33 drivers
-- drop (max 4.4 points); nobody gains.
--
-- BACK OUT: update scoring_parameters set value = 100
--           where name = 'light_allowance_min_per_1k_miles';

update scoring_parameters
set value = 0,
    description = 'Light-speeding minutes per 1,000 miles that cost nothing (0 = every minute counts)'
where name = 'light_allowance_min_per_1k_miles';
