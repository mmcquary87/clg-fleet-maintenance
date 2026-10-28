// One-off tool — speeding-policy back-test: historical weekly mileage pull
//
// NOT a sync function and not wired into any schedule. Supports the
// Aug 2026 proposed speeding-limit back-test (read-only analysis; this
// function writes nothing to any table, changes no scoring logic).
//
// driver_fuel_energy (20261007000000_driver_safety_scorecard.sql) only
// ever holds ONE row per driver, replaced on every sync -- a trailing-
// 90-days-as-of-last-sync snapshot, not a historical daily/weekly log
// (see driver_safety_scorecard_range_fn.sql's own header). There is no
// per-week mileage anywhere in Supabase for Jul-Oct 2026, so this pulls
// it straight from Samsara's own /fleet/reports/drivers/fuel-energy
// report -- the same endpoint samsara-sync-driver-safety already trusts
// for miles-driven -- once per requested date window, and returns the
// result as CSV or JSON. Nothing is persisted; re-run as needed.
//
// Driver identity: reuses drivers.samsara_driver_id, already linked by
// samsara-sync-driver-safety's own name-matching -- does not redo that
// matching here.
//
// POST body (optional): { "windows": [{ "label": "...", "start":
// "YYYY-MM-DD", "end": "YYYY-MM-DD" }, ...] }. Omit it to get the
// default windows: the Mon-Sun weeks from 2026-08-24 through
// 2026-10-26, plus two named comparison periods (2026-07-07..2026-08-31
// and 2026-09-01..2026-10-26).
//
// Query param ?format=csv returns CSV text instead of JSON (default).
//
// Requires SAMSARA_API secret + service role. Deploy with default
// "Enforce JWT verification" ON -- unlike a public webhook, this is only
// ever triggered manually (dashboard Test panel) and spends real Samsara
// API quota per window.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";

function authHeaders() {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  return { Authorization: `Bearer ${token}` };
}

async function samsaraGet(path: string, params: Record<string, string>) {
  const url = new URL(`${SAMSARA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
}

// extractKey lets a caller pull the array out from under a nested key --
// /fleet/reports/drivers/fuel-energy's shape is `data: { driverReports: [...] }`,
// not a flat `data: [...]` array (same gotcha samsara-sync-driver-safety
// documents).
async function fetchAllPaginated(path: string, params: Record<string, string>, extractKey?: string) {
  // deno-lint-ignore no-explicit-any
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet(path, { ...params, ...(after ? { after } : {}) });
    const page = extractKey ? json.data?.[extractKey] : json.data;
    items.push(...(Array.isArray(page) ? page : []));
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return items;
}

function rfc3339Start(d: string) { return `${d}T00:00:00.000Z`; }
function rfc3339End(d: string) { return `${d}T23:59:59.999Z`; }

type Window = { label: string; start: string; end: string };

function defaultWindows(): Window[] {
  const windows: Window[] = [];
  // Mon-Sun weeks covering 2026-08-28..2026-10-26: the first Monday
  // on/before 8/28 is 8/24, the last full week ends 11/1 but is clipped
  // to 10/26 isn't needed since 2026-10-26 is itself a Monday -- the week
  // of 10/26..11/1 is included since it STARTS inside the requested range.
  const cursor = new Date("2026-08-24T00:00:00.000Z");
  const rangeEnd = new Date("2026-10-26T00:00:00.000Z");
  while (cursor <= rangeEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    windows.push({
      label: `week_${weekStart.toISOString().slice(0, 10)}`,
      start: weekStart.toISOString().slice(0, 10),
      end: weekEnd.toISOString().slice(0, 10),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  windows.push({ label: "period_jul07_aug31", start: "2026-07-07", end: "2026-08-31" });
  windows.push({ label: "period_sep01_oct26", start: "2026-09-01", end: "2026-10-26" });
  return windows;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.json().catch(() => ({}));
    const windows: Window[] = Array.isArray(body.windows) && body.windows.length > 0 ? body.windows : defaultWindows();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: ourDrivers, error: driversErr } = await supabase
      .from("drivers").select("id, name, samsara_driver_id").not("samsara_driver_id", "is", null);
    if (driversErr) throw driversErr;
    const nameBySamsaraId = new Map(ourDrivers.map((d) => [d.samsara_driver_id, d.name]));
    const driverIdBySamsaraId = new Map(ourDrivers.map((d) => [d.samsara_driver_id, d.id]));

    const rows: {
      driver_id: string | null; samsara_driver_id: string; driver_name: string;
      window_label: string; window_start: string; window_end: string;
      distance_traveled_meters: number; miles: number;
    }[] = [];

    for (const w of windows) {
      // deno-lint-ignore no-explicit-any
      const reports: any[] = await fetchAllPaginated("/fleet/reports/drivers/fuel-energy", {
        startDate: rfc3339Start(w.start), endDate: rfc3339End(w.end),
      }, "driverReports");
      for (const r of reports) {
        const samsaraDriverId = r.driver?.id;
        if (!samsaraDriverId) continue;
        const meters = r.distanceTraveledMeters ?? 0;
        rows.push({
          driver_id: driverIdBySamsaraId.get(samsaraDriverId) ?? null,
          samsara_driver_id: samsaraDriverId,
          driver_name: nameBySamsaraId.get(samsaraDriverId) ?? r.driver?.name ?? "",
          window_label: w.label,
          window_start: w.start,
          window_end: w.end,
          distance_traveled_meters: meters,
          miles: meters * 0.000621371,
        });
      }
    }

    const format = new URL(req.url).searchParams.get("format") || "json";
    if (format === "csv") {
      const header = "driver_id,samsara_driver_id,driver_name,window_label,window_start,window_end,distance_traveled_meters,miles";
      const lines = rows.map((r) => [
        r.driver_id ?? "", r.samsara_driver_id, `"${(r.driver_name ?? "").replace(/"/g, '""')}"`,
        r.window_label, r.window_start, r.window_end, r.distance_traveled_meters, r.miles.toFixed(2),
      ].join(","));
      return new Response([header, ...lines].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    }

    return new Response(JSON.stringify({ windowCount: windows.length, rowCount: rows.length, rows }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
