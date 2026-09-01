import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
export function useAllWorkOrders(range) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("work_orders")
      .select(
        "id, wo_number, category, severity, description, complaint, cost, status, approval_status, " +
        "date_opened, date_closed, invoice_ref, po_number, is_chargeback, chargeback_driver_name, " +
        "voided, voided_at, voided_reason, " +
        "unit:units(id, number), vendor:vendors(id, name)"
      )
      .order("date_opened", { ascending: false })
      .limit(500);

    if (range?.start) query = query.gte("date_opened", range.start);
    if (range?.end) query = query.lte("date_opened", range.end);

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setOrders([]);
    } else {
      setOrders(data ?? []);
    }
    setLoading(false);
  }, [range?.start, range?.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { orders, loading, error, reload: load };
}
