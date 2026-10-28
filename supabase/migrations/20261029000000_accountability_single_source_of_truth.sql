-- Driver Safety / Accountability — foundational rebuild, Phase 1
--
-- accountability_infractions becomes the single source of truth for every
-- category/point/fine value in this module. Until now the same scoring math
-- was hand-duplicated and had drifted across: driver_safety_scorecard's
-- inline CASE expressions (20261007040000, 20261014030000, 20261028030000),
-- driver_safety_scorecard_range's copy of the same (20261015010000), and the
-- fine-protection/eligibility CASE logic re-pasted whole 3 times
-- (20261007060000, 20261014010000, 20261028040000) just to tweak one
-- condition each time.
--
-- Real consequence of the drift: accountability_infractions (ported verbatim
-- from the old Excel workbook, 20261007060000) has DIFFERENT point values
-- than the Samsara "Magic Math" scorecard for the same real-world categories
-- -- e.g. Harsh Brake is 1 pt here vs 0.75 in the scorecard (and the official
-- FINAL doc); Speeding tiers are 1/2/3 here vs 0.25/0.75/1.75; Shift Driving
-- Limit is 2 here vs 2.75. The scorecard's values are the ones already
-- confirmed against the official doc's embedded point tables, so this
-- migration corrects accountability_infractions to match them (not the
-- other way around) -- a data correction, not a re-derivation -- before
-- making it the thing both systems join against. Also renames two rows to
-- the official doc's terminology ("Close Following" -> "Following Distance",
-- "Forward Collision Following" -> "Forward Collision Warning") -- same
-- real-world events, just the old Excel sheet named them differently; safe
-- since driver_incidents references infraction_id, never name.
--
-- "Harsh Accel" has no basis in the official doc and no scorecard
-- equivalent -- kept as a manual-only, never-scored infraction (CLG
-- direction, 2026-10-28), same treatment as PC Misuse/Yard Move were before
-- this migration.
--
-- New: accountability_infraction_patterns normalizes the Samsara
-- auto-detection rules (previously baked into SQL CASE expressions) as data
-- -- one row per (infraction, match_type, match_value). A category with NO
-- row here is manual-only (PC Misuse, Yard Move, Harsh Accel, DVIR Defect
-- Not Reported). New counts_toward_score flag separates "Samsara technically
-- reports this" from "this should move the Driver Score" -- Missing Driver
-- Certification/Shipping ID/Trailer Name match real HOS violation
-- descriptions but are deliberately excluded (20261014030000's paperwork-
-- saturation fix); DVIR Defect Not Reported and Harsh Accel are manual but
-- never scored (Dvir.jsx: "DVIR defects never affect a driver's score").
-- Future point-value changes become a data `update`, not a new migration
-- touching 2+ SQL files; a future new auto-detected category becomes one
-- insert + one pattern row, not a new CASE branch.

-- Point corrections (bringing the legacy Excel values in line with the
-- confirmed-correct Samsara/official-doc values; fine_amount already
-- matched the official Fine Schedule exactly, untouched).
update accountability_infractions set points = 0.75 where name = 'Harsh Brake';
update accountability_infractions set points = 0.75 where name = 'Rolling Stop';
update accountability_infractions set points = 0.25 where name = 'Moderate Speeding';
update accountability_infractions set points = 0.75 where name = 'Heavy Speeding';
update accountability_infractions set points = 1.75 where name = 'Severe Speeding';
update accountability_infractions set points = 0.75 where name = 'Missed Rest Break';
update accountability_infractions set points = 2.75 where name = 'Shift Driving Limit';
update accountability_infractions set points = 2.75 where name = 'Cycle Limit';
update accountability_infractions set points = 2.75 where name = 'Shift Duty Limit';
update accountability_infractions set points = 2.0 where name = 'Ran Red Light';
update accountability_infractions set points = 2.0 where name = 'Crash';
update accountability_infractions set name = 'Following Distance', points = 1.5 where name = 'Close Following';
update accountability_infractions set name = 'Forward Collision Warning', points = 1.75 where name = 'Forward Collision Following';

-- Scorecard already scores "roadside parking%" (0.75) but no accountability
-- row existed for it at all -- added so the join-based design below has
-- something to join against (omitting it would silently stop scoring it).
insert into accountability_infractions (name, violation_family, severity, points, rollover_days, fine_amount)
values ('Roadside Parking Event', 'Safety Inbox Events', 'Moderate', 0.75, 60, 50);

alter table accountability_infractions add column counts_toward_score boolean not null default true;

update accountability_infractions set counts_toward_score = false
where name in ('Missing Driver Certification', 'Missing Shipping ID''s', 'Missing Trailer Name(s)', 'Harsh Accel', 'DVIR Defect Not Reported');

create table accountability_infraction_patterns (
  id uuid primary key default gen_random_uuid(),
  infraction_id uuid not null references accountability_infractions(id) on delete cascade,
  match_type text not null check (match_type in ('safety_label', 'hos_description', 'speeding_severity')),
  match_value text not null, -- ILIKE pattern for safety_label/hos_description; exact severity_level value for speeding_severity
  created_at timestamptz not null default now(),
  unique (infraction_id, match_type, match_value)
);

insert into accountability_infraction_patterns (infraction_id, match_type, match_value)
select inf.id, 'safety_label', m.pattern
from (values
  ('Harsh Brake', 'harsh brake%'),
  ('Harsh Brake', 'braking%'),
  ('Rolling Stop', 'rolling stop%'),
  ('Following Distance', 'following distance%'),
  ('Forward Collision Warning', 'forward collision%'),
  ('Harsh Turn', 'harsh turn%'),
  ('Crash', 'crash%'),
  ('Roadside Parking Event', 'roadside parking%'),
  ('Ran Red Light', 'ran red light%'),
  ('Ran Red Light', 'red light%')
) as m(infraction_name, pattern)
join accountability_infractions inf on inf.name = m.infraction_name;

insert into accountability_infraction_patterns (infraction_id, match_type, match_value)
select inf.id, 'hos_description', m.pattern
from (values
  ('Missing Driver Certification', 'missing driver certification%'),
  ('Missing Shipping ID''s', 'missing shipping id%'),
  ('Missing Trailer Name(s)', 'missing trailer name%'),
  ('Missed Rest Break', 'missed rest break%'),
  ('Shift Driving Limit', 'shift driving limit%'),
  ('Cycle Limit', 'cycle limit%'),
  ('Shift Duty Limit', 'shift duty limit%')
) as m(infraction_name, pattern)
join accountability_infractions inf on inf.name = m.infraction_name;

insert into accountability_infraction_patterns (infraction_id, match_type, match_value)
select inf.id, 'speeding_severity', m.severity_value
from (values
  ('Moderate Speeding', 'moderate'),
  ('Heavy Speeding', 'heavy'),
  ('Severe Speeding', 'severe')
) as m(infraction_name, severity_value)
join accountability_infractions inf on inf.name = m.infraction_name;

alter table accountability_infraction_patterns enable row level security;
create policy "accountability_infraction_patterns_select_all" on accountability_infraction_patterns for select using (auth.role() = 'authenticated');
create policy "accountability_infraction_patterns_write_admin" on accountability_infraction_patterns for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Scorecard, rewritten to join against accountability_infractions instead of
-- hardcoding points in CASE expressions. LEFT JOINs preserve the original
-- "else 0" behavior for anything that doesn't match a pattern (e.g. a
-- behavior label with no corresponding row), and keep *_event_count as a
-- count of all eligible rows regardless of match, same as before.
create or replace view driver_safety_scorecard as
with window_bounds as (
  select now() - interval '90 days' as window_start, now() as window_end
),
speeding_points as (
  select
    dsi.driver_id,
    sum(coalesce(inf.points, 0)) as penalty_points,
    count(*) as speeding_event_count
  from driver_speeding_intervals dsi
  cross join window_bounds wb
  left join accountability_infraction_patterns p on p.match_type = 'speeding_severity' and p.match_value = dsi.severity_level
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dsi.driver_id is not null
    and dsi.start_time between wb.window_start and wb.window_end
    and dsi.max_speed_kmh * 0.621371 <= 85
    and not dsi.is_dismissed
  group by dsi.driver_id
),
safety_points as (
  select
    dse.driver_id,
    sum(coalesce(inf.points, 0)) as safety_points,
    count(distinct dse.id) as safety_event_count
  from driver_safety_events dse
  cross join window_bounds wb
  cross join lateral jsonb_array_elements(dse.behavior_labels) as label_elem
  left join accountability_infraction_patterns p on p.match_type = 'safety_label' and (label_elem ->> 'name') ilike p.match_value
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dse.driver_id is not null
    and dse.event_time between wb.window_start and wb.window_end
    and coalesce(dse.coaching_state, '') <> 'Dismissed'
  group by dse.driver_id
),
hos_points as (
  select
    dhv.driver_id,
    sum(coalesce(inf.points, 0)) as hos_points
  from driver_hos_violations dhv
  cross join window_bounds wb
  left join accountability_infraction_patterns p on p.match_type = 'hos_description' and dhv.description ilike p.match_value
  left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
  where dhv.driver_id is not null
    and dhv.violation_start_time between wb.window_start and wb.window_end
  group by dhv.driver_id
),
-- Manually-logged infractions with no Samsara pattern at all (PC Misuse,
-- Yard Move Misuse) that are still meant to count toward the Driver Score --
-- generalized from name-listing to a data-driven rule so a future manual-
-- only scored category needs no code change. Scored per-infraction's own
-- rollover_days (the accountability program's point-decay window, 60 days),
-- not the Samsara telemetry's fixed 90-day pull above.
manual_hos_points as (
  select
    di.driver_id,
    sum(inf.points) as manual_hos_points
  from driver_incidents di
  join accountability_infractions inf on inf.id = di.infraction_id
  where inf.counts_toward_score
    and not exists (select 1 from accountability_infraction_patterns p where p.infraction_id = inf.id)
    and di.event_date >= current_date - make_interval(days => inf.rollover_days)
  group by di.driver_id
),
driver_miles as (
  select dfe.driver_id, dfe.distance_traveled_meters * 0.000621371 as miles_driven
  from driver_fuel_energy dfe
  where dfe.driver_id is not null
),
scored as (
  select
    d.id as driver_id,
    d.name as driver_name,
    d.samsara_driver_created_at,
    coalesce(dm.miles_driven, 0) as miles_driven,
    coalesce(sp.speeding_event_count, 0) as speeding_event_count,
    coalesce(sfp.safety_event_count, 0) as safety_event_count,
    -- Speeding is unavailable (not a phantom 100) when Samsara has never
    -- attributed a speeding interval to this driver despite real activity
    -- elsewhere -- the fingerprint of a missing/wrong vehicle static
    -- assignment (confirmed via a live audit: 33/57 vehicles, 10/33 active
    -- drivers unassigned, 2026-10-28). No new Samsara sync needed; inferred
    -- from data already pulled.
    case
      when coalesce(sp.speeding_event_count, 0) = 0
        and (coalesce(sfp.safety_event_count, 0) > 0 or coalesce(hp.hos_points, 0) > 0 or coalesce(dm.miles_driven, 0) > 0)
        then null
      else least(100, 100 * exp(-coalesce(sp.penalty_points, 0) / 700.0))
    end as speeding_score,
    greatest(0, least(100, 100 - coalesce(sfp.safety_points, 0) * 5)) as safety_score,
    greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0)) * 4)) as hos_score
  from drivers d
  left join speeding_points sp on sp.driver_id = d.id
  left join safety_points sfp on sfp.driver_id = d.id
  left join hos_points hp on hp.driver_id = d.id
  left join manual_hos_points mhp on mhp.driver_id = d.id
  left join driver_miles dm on dm.driver_id = d.id
  where d.samsara_driver_id is not null
),
curved as (
  select
    *,
    case when speeding_score is null then (safety_score + hos_score) / 2.0
      else (speeding_score + safety_score + hos_score) / 3.0
    end as raw_score
  from scored
),
with_overall as (
  select
    *,
    case
      when miles_driven <= 0 then null
      when samsara_driver_created_at is not null and samsara_driver_created_at > now() - interval '14 days' then null
      else least(100, 100 * power(raw_score / 100.0, 1.7))
    end as overall_score
  from curved
),
fleet_avg as (
  select avg(overall_score) as avg_score from with_overall where overall_score is not null
)
select
  w.driver_id,
  w.driver_name,
  w.speeding_score,
  w.safety_score,
  w.hos_score,
  w.raw_score,
  w.overall_score,
  w.miles_driven,
  w.speeding_event_count,
  w.safety_event_count,
  case when w.miles_driven > 0 then w.speeding_event_count / (w.miles_driven / 1000.0) else null end as speeding_events_per_1k_miles,
  case when w.miles_driven > 0 then w.safety_event_count / (w.miles_driven / 1000.0) else null end as safety_events_per_1k_miles,
  fa.avg_score as fleet_average_score,
  case when w.overall_score is not null then w.overall_score - fa.avg_score else null end as points_vs_average,
  case
    when w.overall_score is null then null
    when (w.overall_score - fa.avg_score) >= 3 then 'green'
    when (w.overall_score - fa.avg_score) <= -3 then 'red'
    else 'yellow'
  end as score_band
from with_overall w cross join fleet_avg fa;

-- Same join-based rewrite + Speeding-null + manual-infraction generalization
-- applied to the parameterized twin so it stays "the exact same formula" as
-- the view (its own header's stated intent).
create or replace function driver_safety_scorecard_range(window_start timestamptz, window_end timestamptz)
returns table (
  driver_id text,
  driver_name text,
  speeding_score numeric,
  safety_score numeric,
  hos_score numeric,
  raw_score numeric,
  overall_score numeric,
  miles_driven numeric,
  speeding_event_count bigint,
  safety_event_count bigint,
  speeding_events_per_1k_miles numeric,
  safety_events_per_1k_miles numeric,
  fleet_average_score numeric,
  points_vs_average numeric,
  score_band text
)
language sql
stable
as $$
  with speeding_points as (
    select
      dsi.driver_id,
      sum(coalesce(inf.points, 0)) as penalty_points,
      count(*) as speeding_event_count
    from driver_speeding_intervals dsi
    left join accountability_infraction_patterns p on p.match_type = 'speeding_severity' and p.match_value = dsi.severity_level
    left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
    where dsi.driver_id is not null
      and dsi.start_time between window_start and window_end
      and dsi.max_speed_kmh * 0.621371 <= 85
      and not dsi.is_dismissed
    group by dsi.driver_id
  ),
  safety_points as (
    select
      dse.driver_id,
      sum(coalesce(inf.points, 0)) as safety_points,
      count(distinct dse.id) as safety_event_count
    from driver_safety_events dse
    cross join lateral jsonb_array_elements(dse.behavior_labels) as label_elem
    left join accountability_infraction_patterns p on p.match_type = 'safety_label' and (label_elem ->> 'name') ilike p.match_value
    left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
    where dse.driver_id is not null
      and dse.event_time between window_start and window_end
      and coalesce(dse.coaching_state, '') <> 'Dismissed'
    group by dse.driver_id
  ),
  hos_points as (
    select
      dhv.driver_id,
      sum(coalesce(inf.points, 0)) as hos_points
    from driver_hos_violations dhv
    left join accountability_infraction_patterns p on p.match_type = 'hos_description' and dhv.description ilike p.match_value
    left join accountability_infractions inf on inf.id = p.infraction_id and inf.counts_toward_score
    where dhv.driver_id is not null
      and dhv.violation_start_time between window_start and window_end
    group by dhv.driver_id
  ),
  manual_hos_points as (
    select
      di.driver_id,
      sum(inf.points) as manual_hos_points
    from driver_incidents di
    join accountability_infractions inf on inf.id = di.infraction_id
    where inf.counts_toward_score
      and not exists (select 1 from accountability_infraction_patterns p where p.infraction_id = inf.id)
      and di.event_date >= window_start::date
      and di.event_date <= window_end::date
    group by di.driver_id
  ),
  driver_miles as (
    select dfe.driver_id, dfe.distance_traveled_meters * 0.000621371 as miles_driven
    from driver_fuel_energy dfe
    where dfe.driver_id is not null
  ),
  scored as (
    select
      d.id as driver_id,
      d.name as driver_name,
      d.samsara_driver_created_at,
      coalesce(dm.miles_driven, 0) as miles_driven,
      coalesce(sp.speeding_event_count, 0) as speeding_event_count,
      coalesce(sfp.safety_event_count, 0) as safety_event_count,
      case
        when coalesce(sp.speeding_event_count, 0) = 0
          and (coalesce(sfp.safety_event_count, 0) > 0 or coalesce(hp.hos_points, 0) > 0 or coalesce(dm.miles_driven, 0) > 0)
          then null
        else least(100, 100 * exp(-coalesce(sp.penalty_points, 0) / 700.0))
      end as speeding_score,
      greatest(0, least(100, 100 - coalesce(sfp.safety_points, 0) * 5)) as safety_score,
      greatest(0, least(100, 100 - (coalesce(hp.hos_points, 0) + coalesce(mhp.manual_hos_points, 0)) * 4)) as hos_score
    from drivers d
    left join speeding_points sp on sp.driver_id = d.id
    left join safety_points sfp on sfp.driver_id = d.id
    left join hos_points hp on hp.driver_id = d.id
    left join manual_hos_points mhp on mhp.driver_id = d.id
    left join driver_miles dm on dm.driver_id = d.id
    where d.samsara_driver_id is not null
  ),
  curved as (
    select *,
      case when speeding_score is null then (safety_score + hos_score) / 2.0
        else (speeding_score + safety_score + hos_score) / 3.0
      end as raw_score
    from scored
  ),
  with_overall as (
    select
      *,
      case
        when miles_driven <= 0 then null
        when samsara_driver_created_at is not null and samsara_driver_created_at > now() - interval '14 days' then null
        else least(100, 100 * power(raw_score / 100.0, 1.7))
      end as overall_score
    from curved
  ),
  fleet_avg as (
    select avg(overall_score) as avg_score from with_overall where overall_score is not null
  )
  select
    w.driver_id,
    w.driver_name,
    w.speeding_score,
    w.safety_score,
    w.hos_score,
    w.raw_score,
    w.overall_score,
    w.miles_driven,
    w.speeding_event_count,
    w.safety_event_count,
    case when w.miles_driven > 0 then w.speeding_event_count / (w.miles_driven / 1000.0) else null end as speeding_events_per_1k_miles,
    case when w.miles_driven > 0 then w.safety_event_count / (w.miles_driven / 1000.0) else null end as safety_events_per_1k_miles,
    fa.avg_score as fleet_average_score,
    case when w.overall_score is not null then w.overall_score - fa.avg_score else null end as points_vs_average,
    case
      when w.overall_score is null then null
      when (w.overall_score - fa.avg_score) >= 3 then 'green'
      when (w.overall_score - fa.avg_score) <= -3 then 'red'
      else 'yellow'
    end as score_band
  from with_overall w cross join fleet_avg fa;
$$;

grant execute on function driver_safety_scorecard_range(timestamptz, timestamptz) to authenticated;

-- Fine-protection/eligibility logic, collapsed from 3x re-pasted CASE
-- expressions into 2 functions -- future tweaks touch one function, not
-- every view that happens to inline the same comparison.
create or replace function accountability_fine_protection_status(overall_score numeric, fleet_avg numeric)
returns text
language sql
immutable
as $$
  select case
    when overall_score is null then 'Score Needed'
    when overall_score >= fleet_avg and overall_score >= 80 then 'Protected Except Heavy/Severe'
    else 'Below Fleet Average'
  end
$$;

create or replace function accountability_fine_eligibility(
  coaching_stage accountability_coaching_stage,
  severity accountability_severity,
  current_score numeric,
  fleet_avg numeric
)
returns text
language sql
immutable
as $$
  select case
    when coaching_stage not in ('Driver Being Fined', 'Final Warning', 'Termination') then 'No'
    when severity in ('Heavy', 'Severe') then 'Yes'
    when current_score is null or fleet_avg is null then 'Review'
    when current_score < fleet_avg or current_score < 80 then 'Yes'
    else 'No'
  end
$$;

create or replace view driver_accountability_status as
select
  d.id as driver_id,
  d.name as driver_name,
  d.is_active,
  dsc.overall_score as current_score,
  dsc.fleet_average_score,
  case when dsc.overall_score is not null and dsc.fleet_average_score is not null
    then dsc.overall_score - dsc.fleet_average_score end as score_variance,
  accountability_fine_protection_status(dsc.overall_score, dsc.fleet_average_score) as fine_protection_status
from drivers d
left join driver_safety_scorecard dsc on dsc.driver_id = d.id;

create or replace view driver_incident_detail as
select
  i.id,
  i.driver_id,
  d.driver_name,
  i.event_date,
  inf.name as infraction_name,
  inf.violation_family,
  inf.severity,
  inf.points,
  inf.fine_amount,
  i.coaching_stage,
  i.notes,
  i.driver_response,
  i.issued_by,
  i.follow_up_date,
  i.training_assigned,
  i.training_due_date,
  i.training_completed_date,
  i.appeal_status,
  i.appeal_notes,
  d.current_score as driver_score,
  d.fleet_average_score,
  accountability_fine_eligibility(i.coaching_stage, inf.severity, d.current_score, d.fleet_average_score) as fine_eligibility,
  i.created_at,
  i.updated_at,
  i.training_platform
from driver_incidents i
join accountability_infractions inf on inf.id = i.infraction_id
join driver_accountability_status d on d.driver_id = i.driver_id;
