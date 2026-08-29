# Late Load Exposure — Hours-Short Calculation Spec

Supports DE-01 (Projected Late Load Exposure) in the CLG Operations Dashboard
Framework. Read this alongside SPEC.md before implementing.

## Why the current calc is wrong

The live Tracking board computes ETA as `straight_line_distance / 55mph`,
labeled "assumes no required rest." That assumption is the actual bug, not a
footnote: once a driver's drive clock is exhausted, they are legally stopped
until a reset completes, no matter how close the delivery is. A load showing
"0m of drive time left, needs 11h58m more" isn't 11h58m away — it's a 10-hour
reset plus however long the remaining distance takes *after* that reset.

This spec replaces the straight-line heuristic with a projection that accounts
for (a) real route time, and (b) the driver's actual remaining legal drive
time before a mandatory reset.

**Scope note:** this is a dispatch-planning heuristic, not a compliance
determination. Samsara's ELD remains the system of record for actual HOS
violations and legality. This calculation only estimates when a load will
physically arrive, for triage purposes.

## Data required

**Samsara — `GET /fleet/hos/clocks`**
Per-driver current duty status, plus remaining time on each clock:
drive clock (drive time left before a required reset), shift/on-duty clock
(14-hour window), cycle clock (60/7 or 70/8), and break clock (30-minute
rule). This is the field CLG's system currently doesn't call — the Tracking
board only pulls vehicle location, not HOS state, which is why it can't tell
the difference between a driver with 8 hours left to drive and one with 8
minutes.

**Samsara — `GET /fleet/vehicles/locations`** (or `/feed` for polling)
Current lat/lon per vehicle — already in use for the Tracking board.

**Alvys**
Appointment window (start/end) and destination for each active load —
already in use.

**Routing provider — not yet connected**
Google Maps Directions API (or Distance Matrix), called with
`departure_time=now` for traffic-aware duration. Replaces
`distance / 55mph` with a real route time. This is the exact gap the
Tracking board's own banner already flags ("until Google Maps traffic-aware
routing is connected").

## v1 algorithm

Given a load with drive-time-remaining `D` (from the routing call) and the
driver's current drive-clock-remaining `A` (from Samsara HOS clocks):

```
if D <= A:
    projected_arrival = now + D          # no reset needed
else:
    remaining_after_first_leg = D - A
    max_drive_per_reset_cycle = 11h      # property-carrying max drive/day
    reset_duration = 10h                 # default assumption — see limitations

    resets_needed = ceil(remaining_after_first_leg / max_drive_per_reset_cycle)
    total_elapsed = A + (resets_needed * reset_duration) + remaining_after_first_leg

    projected_arrival = now + total_elapsed

hours_short = max(0, projected_arrival - appointment_window_end)   # in hours
buffer_hours = max(0, appointment_window_end - projected_arrival)  # if not late
lead_time = appointment_window_start - now                         # runway to react
```

## Output schema per load

```json
{
  "loadId": "string",
  "unit": "string",
  "driverId": "string",
  "projectedArrival": "ISO 8601 timestamp",
  "appointmentWindowEnd": "ISO 8601 timestamp",
  "hoursShort": 11.97,
  "bufferHours": 0,
  "leadTimeHours": 26.4,
  "severityTier": "Critical",
  "assumptions": {
    "resetHoursAssumed": 10,
    "maxDrivePerCycleHours": 11,
    "routeSource": "google_directions",
    "hosSource": "samsara_hos_clocks"
  }
}
```

## Severity tiers — draft, needs Ops/Safety sign-off

The framework requires prediction lead time, materiality, and escalation
rules to be formally approved before DE-01 activates with any status color.
These cutoffs are illustrative starting points, not approved thresholds:

* Critical: `hoursShort > 10`
* Warning: `5 <= hoursShort <= 10`
* Watch: `0 < hoursShort < 5`
* On pace: `hoursShort == 0 and bufferHours > 0`

## Known limitations — flag these, don't hide them

* Only checks the drive clock / 10-hour-reset constraint. Does not model the
30-minute break clock or 60/7 vs 70/8 cycle exhaustion — both can add delay
this version won't catch. Add cycle-clock as a second gating check before
this feeds anything customer-facing.
* Assumes a fixed 10-hour reset. Split-sleeper provisions aren't modeled.
* Doesn't account for scheduled fuel stops or yard time beyond mandated
resets.
* Needs a CLG-approved prediction horizon (e.g., only project loads with an
appointment inside the next 48 hours — beyond that, the projection is too
speculative to act on).

## Handoff note

Drop this file into the project folder next to SPEC.md (same place the
dashboard JSX files live). Claude Code reads local files directly — no need
to paste this into a prompt. Suggested prompt once it's in place:

> Read late-load-exposure-calc-spec.md and SPEC.md, then implement the
> hours-short projection described here as a function that takes a load's
> current location, HOS clocks, and appointment window, and returns the
> output schema in this spec. Use it to replace the straight-line ETA in the
> Tracking board's Needs Attention view.

If SPEC.md's Samsara endpoint list doesn't already include
`/fleet/hos/clocks`, add it there too — the Tracking board currently only
calls the location endpoint.
