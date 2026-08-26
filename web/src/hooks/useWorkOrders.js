import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// Flattens a work_orders row (joined with units/vendors) into the shape
// the dashboard views expect: { unit, category, vendor, cost, date, ref, desc }
function toRecord(row) {
  return {
    id: row.id,
    unit: row.unit?.number ?? "Unassigned",
    category: row.category,
    vendor: row.vendor?.name ?? "—",
    cost: Number(row.cost) || 0,
    date: row.date_closed,
    ref: row.invoice_ref,
    desc: row.description,
  };
}

export function useWorkOrders() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("work_orders")
      .select(
        "id, category, cost, date_closed, invoice_ref, description, unit:units(number), vendor:vendors(name)"
      )
      .eq("status", "Closed")
      .order("date_closed", { ascending: false });

    if (err) {
      setError(err.message);
      setRecords([]);
    } else {
      setRecords((data ?? []).map(toRecord));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { records, loading, error, reload: load };
}
