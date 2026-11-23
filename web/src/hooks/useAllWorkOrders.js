import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PAGE_SIZE = 500;

const SELECT =
  "id, wo_number, category, severity, description, complaint, cost, status, approval_status, work_order_group_id, " +
  "date_opened, date_closed, invoice_ref, po_number, is_chargeback, chargeback_driver_name, chargeback_deducted_at, " +
  "voided, voided_at, voided_reason, vendor_id, waiting_on_parts, assigned_bay, " +
  "payment_status, payment_method, payment_reference, paid_at, exported_to_intacct_at, " +
  "unit:units(id, number), vendor:vendors(id, name), " +
  "lineItems:work_order_line_items(id, category, description, cost, is_chargeback, chargeback_driver_name)";

// PostgREST filter values are comma/paren delimited: strip what could break out of one.
const cleanTerm = (s) => s.trim().replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
//
// Loads the newest PAGE_SIZE work orders in range, with a loadMore() to
// pull the next PAGE_SIZE beyond whatever's already loaded -- this list is
// display/detail data (full description, vendor/unit joins), not the
// source of truth for counts or totals. A shop with more than PAGE_SIZE
// work orders in range needs useWorkOrderStats for accurate "X open, Y
// closed" numbers regardless of how much of this list is currently loaded.
//
// The page-limited list above can't see older rows, so two things are also
// fetched straight from the database and merged in (by id):
//   voidedOnly  every voided work order in range (the Voided tab; there are few)
//   search      work orders matching the search box on WO number, invoice, PO,
//               description, complaint, unit number or vendor name, however old.
// Without this, an old voided duplicate was invisible on the Voided tab and to
// search until "Load more" had walked far enough down the list (found 2026-11-23).
export function useAllWorkOrders(range, { voidedOnly = false, search = "" } = {}) {
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
      .select(SELECT)
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

  // Rows fetched outside the page window (voided tab / search), merged below.
  const [extra, setExtra] = useState([]);
  const term = cleanTerm(search);
  const wantExtra = voidedOnly || term.length >= 2;
  useEffect(() => {
    if (!wantExtra) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let q = supabase.from("work_orders").select(SELECT).order("date_opened", { ascending: false }).limit(PAGE_SIZE);
      if (range?.start) q = q.gte("date_opened", range.start);
      if (range?.end) q = q.lte("date_opened", range.end);
      if (voidedOnly) q = q.eq("voided", true);
      if (term.length >= 2) {
        const like = `%${term}%`;
        const [{ data: us }, { data: vs }] = await Promise.all([
          supabase.from("units").select("id").ilike("number", like).limit(200),
          supabase.from("vendors").select("id").ilike("name", like).limit(200),
        ]);
        const parts = ["wo_number", "invoice_ref", "po_number", "description", "complaint"].map((c) => `${c}.ilike.${like}`);
        if (us?.length) parts.push(`unit_id.in.(${us.map((u) => u.id).join(",")})`);
        if (vs?.length) parts.push(`vendor_id.in.(${vs.map((v) => v.id).join(",")})`);
        q = q.or(parts.join(","));
      }
      const { data, error: err } = await q;
      if (cancelled) return;
      setExtra(err ? [] : (data ?? []));
    }, term.length >= 2 ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [wantExtra, voidedOnly, term, range?.start, range?.end]);

  const extraRows = wantExtra ? extra : [];
  const merged = extraRows.length === 0 ? orders : (() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    extraRows.forEach((o) => { if (!byId.has(o.id)) byId.set(o.id, o); });
    return Array.from(byId.values());
  })();

  return { orders: merged, loading, loadingMore, hasMore, loadMore, error, reload: () => { setExtra([]); return load(); } };
}
