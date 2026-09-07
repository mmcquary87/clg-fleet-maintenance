import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Per-vendor rollup for the Vendors scoreboard: spend/jobs so far this
// calendar year, which units (if any) they're currently holding via an
// Open/In Progress work order (and whether that held job has a cost/estimate
// on file yet), and average full-job turnaround (open to close) for jobs
// closed this year. Built from real work_orders rows only -- there's no
// tracked "estimate requested" timestamp, so the CLG OS mockup's narrower
// estimate-turnaround stat isn't computed; avgTurnaroundDays measures the
// whole job instead, which is real data already on every closed row.
export function useVendorActivity() {
  const [byVendorId, setByVendorId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const yearStart = `${new Date().getFullYear()}-01-01`;

    // Two separately-scoped queries instead of one "oldest-first, capped at
    // N rows" fetch -- that shape silently dropped this year's rows (and
    // any currently-open job) once total vendor work orders passed the cap,
    // since oldest-first + a row limit keeps the wrong end of the table.
    // Both queries below are naturally bounded by what they ask for (a
    // calendar year of closed jobs; whatever's open right now) rather than
    // by an arbitrary row count, so there's no cap to silently exceed.
    const [ytdRes, holdingRes] = await Promise.all([
      supabase
        .from("work_orders")
        .select("vendor_id, cost, date_opened, date_closed")
        .not("vendor_id", "is", null)
        .eq("voided", false)
        .eq("status", "Closed")
        .gte("date_closed", yearStart),
      supabase
        .from("work_orders")
        .select("vendor_id, date_opened, cost, unit:units(number)")
        .not("vendor_id", "is", null)
        .eq("voided", false)
        .neq("status", "Closed"),
    ]);

    if (ytdRes.error || holdingRes.error) {
      setError(ytdRes.error?.message || holdingRes.error?.message);
      setByVendorId({});
      setLoading(false);
      return;
    }

    const m = {};
    const bucket = (vendorId) => (m[vendorId] ??= { jobsYtd: 0, spendYtd: 0, holding: [], closedDaysTotal: 0, closedDaysCount: 0 });
    for (const row of ytdRes.data ?? []) {
      const v = bucket(row.vendor_id);
      v.jobsYtd += 1;
      v.spendYtd += Number(row.cost) || 0;
      // Days from open to close -- the honest stand-in for "avg estimate
      // turnaround" the CLG OS mockup showed: we don't track a separate
      // estimate-requested timestamp, but full job turnaround is real data
      // already on every closed row.
      if (row.date_opened && row.date_closed) {
        const days = (new Date(row.date_closed) - new Date(row.date_opened)) / 86400000;
        if (days >= 0) {
          v.closedDaysTotal += days;
          v.closedDaysCount += 1;
        }
      }
    }
    for (const row of holdingRes.data ?? []) {
      bucket(row.vendor_id).holding.push({ unit: row.unit?.number ?? "—", since: row.date_opened, hasCost: row.cost != null });
    }
    for (const v of Object.values(m)) {
      v.avgTurnaroundDays = v.closedDaysCount > 0 ? v.closedDaysTotal / v.closedDaysCount : null;
    }
    setByVendorId(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { byVendorId, loading, error, reload: load };
}
