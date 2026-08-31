import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Per-vendor rollup for the Vendors scoreboard: spend/jobs so far this
// calendar year, and which units (if any) they're currently holding via an
// Open/In Progress work order. Built from real work_orders rows only --
// there's no tracked "estimate requested" timestamp, so estimate-turnaround
// stats the CLG OS mockup showed aren't computed here.
export function useVendorActivity() {
  const [byVendorId, setByVendorId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("work_orders")
      .select("vendor_id, cost, status, date_opened, date_closed, unit:units(number)")
      .not("vendor_id", "is", null)
      .order("date_opened", { ascending: true })
      .limit(2000);

    if (err) {
      setError(err.message);
      setByVendorId({});
      setLoading(false);
      return;
    }

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const m = {};
    for (const row of data ?? []) {
      const v = (m[row.vendor_id] ??= {
        jobsYtd: 0, spendYtd: 0, holding: [],
      });
      if (row.status === "Closed") {
        if (row.date_closed && row.date_closed >= yearStart) {
          v.jobsYtd += 1;
          v.spendYtd += Number(row.cost) || 0;
        }
      } else {
        v.holding.push({ unit: row.unit?.number ?? "—", since: row.date_opened });
      }
    }
    setByVendorId(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { byVendorId, loading, error, reload: load };
}
