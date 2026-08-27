import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useAllWorkOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("work_orders")
      .select(
        "id, category, severity, description, complaint, cost, status, approval_status, " +
        "date_opened, date_closed, invoice_ref, po_number, " +
        "unit:units(id, number), vendor:vendors(id, name)"
      )
      .order("date_opened", { ascending: false })
      .limit(500);
    if (err) {
      setError(err.message);
      setOrders([]);
    } else {
      setOrders(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { orders, loading, error, reload: load };
}
