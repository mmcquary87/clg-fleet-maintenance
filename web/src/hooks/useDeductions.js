import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
export function useDeductions(range) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("work_orders")
      .select(
        "id, chargeback_driver_name, category, description, complaint, cost, date_opened, date_closed, " +
        "invoice_ref, po_number, unit:units(number), vendor:vendors(name)"
      )
      .eq("is_chargeback", true)
      .eq("voided", false)
      .order("date_opened", { ascending: false });

    if (range?.start) query = query.gte("date_opened", range.start);
    if (range?.end) query = query.lte("date_opened", range.end);

    const { data, error: err } = await query;

    if (err) {
      setError(err.message);
      setRecords([]);
    } else {
      setRecords(data ?? []);
    }
    setLoading(false);
  }, [range?.start, range?.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { records, loading, error, reload: load };
}
