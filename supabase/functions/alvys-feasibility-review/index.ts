// Fleet Maintenance System — Order Feasibility Review Completion (SC-01)
//
// Definition (framework): accepted orders with a documented feasibility
// review ÷ total accepted orders × 100.
//
// Methodology (CLG, 2026-08-30): CLG doesn't log a discrete feasibility
// review action anywhere — but dispatch policy is "don't dispatch if
// not feasible," so an order reaching Dispatched (or a later status) is
// treated as the review having happened and passed. This is a proxy for
// *whether a dispatch decision got made*, not proof a documented review
// occurred — it can't catch a dispatcher skipping the check and
// dispatching anyway, only orders that never reached a decision at all
// (stuck in Open/Covered, or cancelled before ever being dispatched).
// Stated as a caveat on the KPI card, not hidden.
//
// Uses the same hourly Alvys backup sheet as alvys-assignment-stability
// (KPI 2) — TripStatus per snapshot, keyed by LoadNumber. An order counts
// as "reviewed" if TripStatus is ever Dispatched, In Transit, or
// Delivered at any snapshot (a load cancelled *after* being dispatched
// still counts — the decision was already made; the cancellation is a
// separate, unrelated event).
//
// "Accepted orders" = distinct loads whose ScheduledPickupAt falls in
// the requested date range (same population definition as KPI 2's
// eligibility filter, for consistency across the dashboard's date
// picker).
//
// Requires ALVYS_LOADS_SHEET_CSV_URLTRIPS secret (the published CSV link
// for the trips/loads backup tab).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REVIEWED_TRIP_STATUSES = new Set(["Dispatched", "In Transit", "Delivered"]);

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
  loadNumber: string;
  scheduledPickupMs: number | null;
  tripStatus: string;
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
    const rangeEndMs = new Date(endDate + "T23:59:59Z").getTime();

    const csvUrl = Deno.env.get("ALVYS_LOADS_SHEET_CSV_URLTRIPS");
    if (!csvUrl) throw new Error("ALVYS_LOADS_SHEET_CSV_URLTRIPS secret not set");

    const res = await fetch(csvUrl);
    const text = await res.text();
    if (!res.ok) throw new Error(`Sheet CSV fetch failed (${res.status}): ${text.slice(0, 500)}`);

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const header = splitCsvLine(lines[0] ?? "");
    const idx = (name: string) => header.indexOf(name);
    const iLoad = idx("LoadNumber"), iSched = idx("ScheduledPickupAt"), iTripStatus = idx("TripStatus");
    if (iLoad < 0 || iSched < 0 || iTripStatus < 0) {
      throw new Error(`Expected columns not found. Header was: ${header.join(", ")}`);
    }

    const rows: Row[] = [];
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const loadNumber = (cells[iLoad] ?? "").trim();
      const scheduledPickupRaw = (cells[iSched] ?? "").trim();
      const scheduledPickupMs = scheduledPickupRaw ? new Date(scheduledPickupRaw).getTime() : null;
      const tripStatus = (cells[iTripStatus] ?? "").trim();
      if (!loadNumber) continue;
      rows.push({ loadNumber, scheduledPickupMs, tripStatus });
    }

    const byLoad = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byLoad.get(r.loadNumber) ?? [];
      arr.push(r);
      byLoad.set(r.loadNumber, arr);
    }

    let totalOrders = 0;
    let reviewedOrders = 0;
    let cancelledNeverDispatched = 0;
    const unreviewedLoads: string[] = [];

    for (const [loadNumber, snaps] of byLoad) {
      const scheduledPickupMs = snaps.find((s) => s.scheduledPickupMs != null)?.scheduledPickupMs ?? null;
      if (scheduledPickupMs == null) continue;
      if (scheduledPickupMs < rangeStartMs || scheduledPickupMs > rangeEndMs) continue;
      totalOrders += 1;

      const everReviewed = snaps.some((s) => REVIEWED_TRIP_STATUSES.has(s.tripStatus));
      if (everReviewed) {
        reviewedOrders += 1;
      } else {
        unreviewedLoads.push(loadNumber);
        if (snaps.some((s) => s.tripStatus === "Cancelled")) cancelledNeverDispatched += 1;
      }
    }

    return new Response(JSON.stringify({
      totalOrders,
      reviewedOrders,
      unreviewedOrders: totalOrders - reviewedOrders,
      cancelledNeverDispatched,
      reviewCompletionPct: totalOrders > 0 ? Math.round((reviewedOrders / totalOrders) * 1000) / 10 : null,
      unreviewedLoads: unreviewedLoads.slice(0, 25),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
