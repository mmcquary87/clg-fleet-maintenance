import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 500;

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
//
// Loads the newest PAGE_SIZE work orders in range, with a loadMore() to
// pull the next PAGE_SIZE beyond whatever's already loaded -- this list is
// display/detail data (full description, vendor/unit joins), not the
// source of truth for counts or totals. A shop with more than PAGE_SIZE
// work orders in range needs useWorkOrderStats for accurate "X open, Y
// closed" numbers regardless of how much of this list is currently loaded.
export function useAllWorkOrders(range) {
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(0); // 0-indexed page of PAGE_SIZE, inclusive of all pages up to and including this one
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const fetchThrough = useCallback(async (throughPage, { silent } = {}) => {
    if (silent) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    let query = supabase
      .from("work_orders")
      .select(
        "id, wo_number, category, severity, description, complaint, cost, status, approval_status, " +
        "date_opened, date_closed, invoice_ref, po_number, is_chargeback, chargeback_driver_name, " +
        "voided, voided_at, voided_reason, vendor_id, waiting_on_parts, assigned_bay, " +
        "unit:units(id, number), vendor:vendors(id, name)"
      )
      .order("date_opened", { ascending: false })
      .range(0, (throughPage + 1) * PAGE_SIZE - 1);

    if (range?.start) query = query.gte("date_opened", range.start);
    if (range?.end) query = query.lte("date_opened", range.end);

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setOrders([]);
      setHasMore(false);
    } else {
      const rows = data ?? [];
      setOrders(rows);
      setPage(throughPage);
      // A full page came back, so there may be more beyond it -- won't know
      // for certain until the next loadMore() comes back short.
      setHasMore(rows.length === (throughPage + 1) * PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [range?.start, range?.end]);

  const load = useCallback(() => fetchThrough(0), [fetchThrough]);
  const loadMore = useCallback(() => fetchThrough(page + 1, { silent: true }), [fetchThrough, page]);

  useEffect(() => {
    load();
  }, [load]);

  return { orders, loading, loadingMore, hasMore, loadMore, error, reload: load };
}
