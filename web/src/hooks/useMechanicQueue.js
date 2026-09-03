import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// The mechanic's job queue: every non-voided Open/In Progress work order,
// regardless of when it was opened or who it's assigned to -- a small shop
// with one mechanic doesn't need date-range filtering or strict
// assigned_tech matching to find "what am I working on."
export function useMechanicQueue() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("work_orders")
      .select(
        "id, wo_number, category, severity, complaint, description, status, assigned_tech, labor_hours, date_opened, " +
        "unit:units(id, number, type)"
      )
      .in("status", ["Open", "In Progress"])
      .eq("voided", false)
      .order("date_opened", { ascending: true });

    if (err) {
      setError(err.message);
      setOrders([]);
    } else {
      setOrders(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { orders, loading, error, reload: load };
}
