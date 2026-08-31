import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Per-unit rollup for the Units scoreboard: spend/item count closed this
// calendar year, and the single most relevant currently-open work order (a
// "Unit down" one wins over any other open item, otherwise the most
// recent) so the card can lead with a plain-English sentence about what's
// actually happening instead of just a maintenance-status badge.
export function useUnitActivity() {
  const [byUnitId, setByUnitId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("work_orders")
      .select("unit_id, cost, status, date_closed, severity, category, complaint, description, wo_number, vendor:vendors(name)")
      .order("date_opened", { ascending: false })
      .limit(1000);

    if (err) {
      setError(err.message);
      setByUnitId({});
      setLoading(false);
      return;
    }

    const yearStart = `${new Date().getFullYear()}-01-01`;
    const m = {};
    for (const row of data ?? []) {
      const v = (m[row.unit_id] ??= { spendYtd: 0, itemsYtd: 0, categories: new Set(), openOrder: null });
      if (row.status === "Closed") {
        if (row.date_closed && row.date_closed >= yearStart) {
          v.spendYtd += Number(row.cost) || 0;
          v.itemsYtd += 1;
          v.categories.add(row.category);
        }
      } else if (!v.openOrder || (row.severity === "Unit down" && v.openOrder.severity !== "Unit down")) {
        v.openOrder = row;
      }
    }
    setByUnitId(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { byUnitId, loading, error, reload: load };
}
