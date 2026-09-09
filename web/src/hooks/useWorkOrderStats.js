import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Accurate status counts + total cost for the CURRENT date range, computed
// from an uncapped query over lightweight columns only (status, voided,
// approval_status, cost -- no joins, no description text). This exists
// because useAllWorkOrders caps its detailed fetch at a page size for
// display performance; deriving the headline "X open, Y closed" numbers
// from that capped list silently undercounts anything older than the page
// once a shop has more open items in a range than one page holds. This
// hook is the source of truth for those numbers regardless of how much of
// the list has actually been loaded/paged into view.
export function useWorkOrderStats(range) {
  const [stats, setStats] = useState({
    total: 0, needsApproval: 0, open: 0, inProgress: 0, closed: 0, voided: 0, totalCostOpenAndClosed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from("work_orders").select("status, voided, approval_status, cost");
    if (range?.start) query = query.gte("date_opened", range.start);
    if (range?.end) query = query.lte("date_opened", range.end);

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    setStats({
      total: rows.length,
      needsApproval: rows.filter((o) => !o.voided && o.approval_status === "needs_approval").length,
      open: rows.filter((o) => !o.voided && o.status === "Open").length,
      inProgress: rows.filter((o) => !o.voided && o.status === "In Progress").length,
      closed: rows.filter((o) => !o.voided && o.status === "Closed").length,
      voided: rows.filter((o) => o.voided).length,
      totalCostOpenAndClosed: rows.reduce((s, o) => s + (o.voided ? 0 : Number(o.cost) || 0), 0),
    });
    setLoading(false);
  }, [range?.start, range?.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, error, reload: load };
}
