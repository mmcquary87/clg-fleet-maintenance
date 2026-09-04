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

    const yearStart = `${new Date().getFullYear()}-01-01`;

    // Two separately-scoped queries instead of one "newest-first, capped at
    // N rows" fetch -- that shape could silently drop a unit's one
    // lingering open work order (or this year's spend) once total
    // non-voided work orders fleet-wide passed the cap. Both queries below
    // are naturally bounded by what they ask for (a calendar year of
    // closed jobs; whatever's open right now) rather than by an arbitrary
    // row count.
    const [ytdRes, openRes] = await Promise.all([
      supabase
        .from("work_orders")
        .select("unit_id, cost, category")
        .eq("voided", false)
        .eq("status", "Closed")
        .gte("date_closed", yearStart),
      supabase
        .from("work_orders")
        .select("unit_id, severity, category, complaint, description, wo_number, vendor:vendors(name)")
        .eq("voided", false)
        .neq("status", "Closed")
        .order("date_opened", { ascending: false }),
    ]);

    if (ytdRes.error || openRes.error) {
      setError(ytdRes.error?.message || openRes.error?.message);
      setByUnitId({});
      setLoading(false);
      return;
    }

    const m = {};
    const bucket = (unitId) => (m[unitId] ??= { spendYtd: 0, itemsYtd: 0, categories: new Set(), openOrder: null });
    for (const row of ytdRes.data ?? []) {
      const v = bucket(row.unit_id);
      v.spendYtd += Number(row.cost) || 0;
      v.itemsYtd += 1;
      v.categories.add(row.category);
    }
    // openRes is newest-first, so the first row seen per unit is already
    // the most recent -- only overridden by a later "Unit down" row.
    for (const row of openRes.data ?? []) {
      const v = bucket(row.unit_id);
      if (!v.openOrder || (row.severity === "Unit down" && v.openOrder.severity !== "Unit down")) {
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
