import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// Flattens a work_orders row (joined with units/vendors) into the shape
// the dashboard views expect: { unit, unitType, category, vendor, cost, date, ref, desc }
// `parts` carries each logged part's own category/cost so the Spend-by-
// category chart can split spend across them (see lib/categorySplit.js)
// instead of counting every part's cost under the work order's own single
// category -- everything else here (filtering, CSV export, vendor
// grouping) keeps using the work order's own `category` unchanged.
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
            "parts:work_order_parts(category, quantity, unit_cost)"
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
