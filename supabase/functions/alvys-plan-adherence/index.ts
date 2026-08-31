// Fleet Maintenance System — Operating Plan Adherence (KPI 10)
//
// Definition (framework): eligible completed loads executed per the final
// approved plan ÷ eligible completed loads × 100.
//
// Methodology (CLG, 2026-08-31): consistent with SC-01's "don't dispatch
// if not feasible" logic, a load's plan is treated as locked in the
// moment it first reaches Dispatched status -- that's the "final approved
// plan" checkpoint. "Executed per the final approved plan" means the
// load's schedule (ScheduledPickupAt, ScheduledDeliveryAt) and assigned
// driver were unchanged between that Dispatched snapshot and the load's
// last known state. Any change to either counts as a deviation --
// tractor/trailer reassignment isn't checked (not tracked in this sheet,
// same limitation as KPI 2).
//
// "Eligible completed loads" = loads that reached TripStatus "Delivered"
// at some snapshot, AND had a captured Dispatched snapshot to compare
// against (a load already past Dispatched before this sheet started
// tracking has no real checkpoint and is excluded, not counted as a
// failure).
//
// Completion date (for the requested range filter): DeliveredAt if the
// sheet has it populated; otherwise the SnapshotTime of the last
// observation, as a proxy -- DeliveredAt is frequently blank in this
// data source as of 2026-08-31 (see sheet-explore-trips' sample rows).
//
// Uses the same hourly Alvys backup sheet as KPI 2 / SC-01.
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

interface Row {
  snapshotMs: number;
  loadNumber: string;
  tripStatus: string;
  scheduledPickupMs: number | null;
  scheduledDeliveryMs: number | null;
  deliveredAtMs: number | null;
  tripDriverId: string;
}

// Same wall-clock-as-UTC handling as KPI 2 -- consistent relative
// ordering is all this needs, not true UTC time.
function parseSnapshotDate(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, mo, d, y, h, min, sec] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(min ?? 0), Number(sec ?? 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate (YYYY-MM-DD) are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rangeStartMs = new Date(startDate + "T00:00:00Z").getTime();
    const requestedEndMs = new Date(endDate + "T23:59:59Z").getTime();
    const rangeEndMs = Math.min(requestedEndMs, Date.now());

    const csvUrl = Deno.env.get("ALVYS_LOADS_SHEET_CSV_URLTRIPS");
    if (!csvUrl) throw new Error("ALVYS_LOADS_SHEET_CSV_URLTRIPS secret not set");

    const res = await fetch(csvUrl);
    const text = await res.text();
    if (!res.ok) throw new Error(`Sheet CSV fetch failed (${res.status}): ${text.slice(0, 500)}`);

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const header = splitCsvLine(lines[0] ?? "");
    const idx = (name: string) => header.indexOf(name);
    const iSnap = idx("SnapshotTime"), iLoad = idx("LoadNumber"), iTripStatus = idx("TripStatus");
    const iSchedPickup = idx("ScheduledPickupAt"), iSchedDelivery = idx("ScheduledDeliveryAt");
    const iDeliveredAt = idx("DeliveredAt"), iDriver = idx("TripDriverId");
    if ([iSnap, iLoad, iTripStatus, iSchedPickup, iSchedDelivery, iDeliveredAt, iDriver].some((i) => i < 0)) {
      throw new Error(`Expected columns not found. Header was: ${header.join(", ")}`);
    }

    const parseTs = (raw: string) => (raw ? new Date(raw).getTime() : null);

    const rows: Row[] = [];
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const snapshotMs = parseSnapshotDate(cells[iSnap] ?? "");
      const loadNumber = (cells[iLoad] ?? "").trim();
      if (snapshotMs == null || !loadNumber) continue;
      rows.push({
        snapshotMs,
        loadNumber,
        tripStatus: (cells[iTripStatus] ?? "").trim(),
        scheduledPickupMs: parseTs((cells[iSchedPickup] ?? "").trim()),
        scheduledDeliveryMs: parseTs((cells[iSchedDelivery] ?? "").trim()),
        deliveredAtMs: parseTs((cells[iDeliveredAt] ?? "").trim()),
        tripDriverId: (cells[iDriver] ?? "").trim(),
      });
    }

    const byLoad = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byLoad.get(r.loadNumber) ?? [];
      arr.push(r);
      byLoad.set(r.loadNumber, arr);
    }
    for (const arr of byLoad.values()) arr.sort((a, b) => a.snapshotMs - b.snapshotMs);

    let eligible = 0;
    let adherent = 0;
    let notDelivered = 0;
    let deliveredButNoDispatchCheckpoint = 0;
    const deviations: {
      loadNumber: string;
      scheduleChanged: boolean;
      driverChanged: boolean;
      plannedDriver: string;
      finalDriver: string;
    }[] = [];

    for (const [loadNumber, snaps] of byLoad) {
      const finalSnap = snaps[snaps.length - 1];
      const everDelivered = snaps.some((s) => s.tripStatus === "Delivered");
      if (!everDelivered) { notDelivered += 1; continue; }

      // Completion date: DeliveredAt if the sheet ever populated it for
      // this load, else the last snapshot's own time as a proxy.
      const deliveredAtMs = snaps.find((s) => s.deliveredAtMs != null)?.deliveredAtMs ?? finalSnap.snapshotMs;
      if (deliveredAtMs < rangeStartMs || deliveredAtMs > rangeEndMs) continue;

      const dispatchSnap = snaps.find((s) => s.tripStatus === "Dispatched");
      if (!dispatchSnap) { deliveredButNoDispatchCheckpoint += 1; continue; }

      eligible += 1;
      const scheduleChanged = dispatchSnap.scheduledPickupMs !== finalSnap.scheduledPickupMs
        || dispatchSnap.scheduledDeliveryMs !== finalSnap.scheduledDeliveryMs;
      const driverChanged = dispatchSnap.tripDriverId !== finalSnap.tripDriverId;

      if (!scheduleChanged && !driverChanged) {
        adherent += 1;
      } else {
        deviations.push({
          loadNumber,
          scheduleChanged,
          driverChanged,
          plannedDriver: dispatchSnap.tripDriverId || "(unassigned)",
          finalDriver: finalSnap.tripDriverId || "(unassigned)",
        });
      }
    }

    return new Response(JSON.stringify({
      cappedToNow: rangeEndMs < requestedEndMs,
      loadsTracked: byLoad.size,
      notDelivered,
      deliveredButNoDispatchCheckpoint,
      eligibleCompletedLoads: eligible,
      adherentLoads: adherent,
      adherencePct: eligible > 0 ? Math.round((adherent / eligible) * 1000) / 10 : null,
      deviations: deviations.slice(0, 25),
      deviationsTotal: deviations.length,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
