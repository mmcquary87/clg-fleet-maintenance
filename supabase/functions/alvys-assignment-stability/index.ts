// Fleet Maintenance System — 72-Hour Load Assignment Stability (KPI 2)
//
// Uses CLG's own hourly Alvys backup (a Google Sheet tab published as
// CSV, tracking LoadNumber/Status/TripStatus/TripDriverId/TripAssignedAt/
// ScheduledPickupAt snapshots over time) to detect driver-assignment
// churn before execution — data the live Alvys API can't give us, since
// it only shows current state.
//
// Definition (framework): eligible assignments unchanged from the
// 72-hour checkpoint through final release ÷ eligible assignments active
// at the 72-hour checkpoint × 100.
//
// Switched 2026-08-30 from an earlier 4-hour-refresh tab (which only
// tracked LoadNumber/TripDriverId/ScheduledPickupAt and was returning 0
// eligible assignments against a 3-month test range) to this richer,
// hourly tab CLG pointed to — same spreadsheet, different tab.
//
// Approximations, stated plainly rather than hidden:
//  - SnapshotTime now includes time-of-day ("8/26/2026 21:54:55") after
//    the sheet's SnapshotTime column was reformatted from Date to Date
//    time — but rows written before that fix are still date-only, so
//    older history resolves to UTC midnight of that day. New rows carry
//    real hour-level precision.
//  - "Final release" isn't a real timestamped event in this data — the
//    last snapshot at or before ScheduledPickupAt is used as a proxy.
//  - Driver-only. The sheet doesn't track TruckId, so tractor
//    reassignment isn't part of this calculation.
//
// Requires ALVYS_LOADS_SHEET_CSV_URLTRIPS secret (the published CSV link
// for the trips/loads backup tab).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}

// Handles both "8/26/2026" (older rows, pre date-time fix -> UTC
// midnight) and "8/26/2026 21:54:55" (current rows, real precision).
// The sheet's timestamps are wall-clock, not UTC — treated as UTC here
// since we only need consistent relative ordering, not true UTC time.
function parseSnapshotDate(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, mo, d, y, h, min, sec] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(min ?? 0), Number(sec ?? 0));
}

interface Row {
  snapshotMs: number;
  loadNumber: string;
  scheduledPickupMs: number | null;
  tripDriverId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startDate, endDate, checkpointHours } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate (YYYY-MM-DD) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const checkpointMs = (checkpointHours ?? 72) * 3600 * 1000;
    const rangeStartMs = new Date(startDate + "T00:00:00Z").getTime();
    const rangeEndMs = new Date(endDate + "T23:59:59Z").getTime();

    const csvUrl = Deno.env.get("ALVYS_LOADS_SHEET_CSV_URLTRIPS");
    if (!csvUrl) throw new Error("ALVYS_LOADS_SHEET_CSV_URLTRIPS secret not set");

    const res = await fetch(csvUrl);
    const text = await res.text();
    if (!res.ok) throw new Error(`Sheet CSV fetch failed (${res.status}): ${text.slice(0, 500)}`);

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const header = splitCsvLine(lines[0] ?? "");
    const idx = (name: string) => header.indexOf(name);
    const iSnap = idx("SnapshotTime"), iLoad = idx("LoadNumber"), iSched = idx("ScheduledPickupAt"), iDriver = idx("TripDriverId");
    if (iSnap < 0 || iLoad < 0 || iSched < 0 || iDriver < 0) {
      throw new Error(`Expected columns not found. Header was: ${header.join(", ")}`);
    }

    const rows: Row[] = [];
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const snapshotMs = parseSnapshotDate(cells[iSnap] ?? "");
      const loadNumber = (cells[iLoad] ?? "").trim();
      const scheduledPickupRaw = (cells[iSched] ?? "").trim();
      const scheduledPickupMs = scheduledPickupRaw ? new Date(scheduledPickupRaw).getTime() : null;
      const tripDriverId = (cells[iDriver] ?? "").trim();
      if (snapshotMs == null || !loadNumber) continue;
      rows.push({ snapshotMs, loadNumber, scheduledPickupMs, tripDriverId });
    }

    const byLoad = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byLoad.get(r.loadNumber) ?? [];
      arr.push(r);
      byLoad.set(r.loadNumber, arr);
    }
    for (const arr of byLoad.values()) arr.sort((a, b) => a.snapshotMs - b.snapshotMs);

    let eligible = 0;
    let stable = 0;
    let loadsInRange = 0;
    let loadsWithNoLeadTime = 0; // in range, but earliest snapshot isn't checkpointHours before pickup
    let loadsWithNoDriverAtCheckpoint = 0; // had lead time, but no driver assigned yet at that point
    const leadHoursSamples: number[] = [];
    const changedLoads: { loadNumber: string; checkpointDriver: string; finalDriver: string }[] = [];

    for (const [loadNumber, snaps] of byLoad) {
      const scheduledPickupMs = snaps.find((s) => s.scheduledPickupMs != null)?.scheduledPickupMs ?? null;
      if (scheduledPickupMs == null) continue;
      if (scheduledPickupMs < rangeStartMs || scheduledPickupMs > rangeEndMs) continue;
      loadsInRange += 1;

      const earliestSnapMs = snaps[0].snapshotMs;
      leadHoursSamples.push((scheduledPickupMs - earliestSnapMs) / 3600000);

      const checkpointCutoff = scheduledPickupMs - checkpointMs;
      const checkpointSnap = [...snaps].reverse().find((s) => s.snapshotMs <= checkpointCutoff);
      if (!checkpointSnap) { loadsWithNoLeadTime += 1; continue; } // no snapshot old enough to check
      if (!checkpointSnap.tripDriverId) { loadsWithNoDriverAtCheckpoint += 1; continue; } // tracked early enough, but unassigned at that point

      const finalSnap = [...snaps].reverse().find((s) => s.snapshotMs <= scheduledPickupMs) ?? snaps[snaps.length - 1];
      const finalDriver = finalSnap.tripDriverId;

      eligible += 1;
      if (finalDriver === checkpointSnap.tripDriverId) {
        stable += 1;
      } else {
        changedLoads.push({ loadNumber, checkpointDriver: checkpointSnap.tripDriverId, finalDriver: finalDriver || "(unassigned)" });
      }
    }

    leadHoursSamples.sort((a, b) => a - b);
    const medianLeadHours = leadHoursSamples.length
      ? leadHoursSamples[Math.floor(leadHoursSamples.length / 2)]
      : null;

    return new Response(JSON.stringify({
      checkpointHours: checkpointMs / 3600000,
      totalSnapshotRows: rows.length,
      loadsTracked: byLoad.size,
      loadsInRange,
      loadsWithNoLeadTime,
      loadsWithNoDriverAtCheckpoint,
      medianLeadHoursFromFirstSnapshotToPickup: medianLeadHours != null ? Math.round(medianLeadHours * 10) / 10 : null,
      maxLeadHoursObserved: leadHoursSamples.length ? Math.round(leadHoursSamples[leadHoursSamples.length - 1] * 10) / 10 : null,
      eligibleAssignments: eligible,
      stableAssignments: stable,
      stabilityPct: eligible > 0 ? Math.round((stable / eligible) * 1000) / 10 : null,
      changedLoads: changedLoads.slice(0, 25),
      changedLoadsTotal: changedLoads.length,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
