import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// Flattens a work_orders row (joined with units/vendors) into the shape
// the dashboard views expect: { unit, unitType, category, vendor, cost, date, ref, desc }
// `lineItems` is the real per-category invoice breakdown for a work order
// that covers several repair categories (work_order_line_items) -- when
// present, lib/categorySplit.js uses it as the authoritative split instead
// of the older `parts`-based proportional estimate (mechanic-logged parts
// against an already-fixed total). Everything else here (filtering, CSV
// export, vendor grouping) keeps using the work order's own `category`
// unchanged -- that's still a real, correct category for the common
// single-category case, just not the whole picture for a multi-item one.
function toRecord(row) {
  return {
    id: row.id,
    unit: row.unit?.number ?? "Unassigned",
    unitType: row.unit?.type ?? null,
    unitOwnership: row.unit?.ownership ?? null,
    category: row.category,
    vendor: row.vendor?.name ?? "—",
    cost: Number(row.cost) || 0,
    date: row.date_closed,
    ref: row.invoice_ref,
    desc: row.description,
    parts: (row.parts ?? []).map((p) => ({
      category: p.category ?? null,
      quantity: Number(p.quantity) || 0,
      unitCost: p.unit_cost != null ? Number(p.unit_cost) : null,
    })),
    lineItems: (row.lineItems ?? []).map((li) => ({
      category: li.category,
      amount: Number(li.cost) || 0,
    })),
  };
}

const PAGE_SIZE = 1000;

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
export function useWorkOrders(range) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // "All time" (range === null) has no upper bound on row count -- this
      // is the main Spend page's source of truth for total fleet spend, so
      // an arbitrary .limit() here would silently under-report spend once
      // closed work orders exceed it (the same class of bug that caused
      // the Cost/Mile undercount earlier). Paginate with .range() instead,
      // so every matching row is fetched regardless of how many there are.
      const rows = [];
      let from = 0;
      while (true) {
        let query = supabase
          .from("work_orders")
          .select(
            "id, category, cost, date_closed, invoice_ref, description, unit:units(number, type, ownership), vendor:vendors(name), " +
            "parts:work_order_parts(category, quantity, unit_cost), lineItems:work_order_line_items(category, cost)"
          )
          .eq("status", "Closed")
          .eq("voided", false)
          .order("date_closed", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (range?.start) query = query.gte("date_closed", range.start);
        if (range?.end) query = query.lte("date_closed", range.end);

        const { data, error: err } = await query;
        if (err) throw err;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setRecords(rows.map(toRecord));
    } catch (err) {
      setError(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [range?.start, range?.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { records, loading, error, reload: load };
}
