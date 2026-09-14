import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
// Owner-operators are billed a flat amount per chargeback regardless of the
// unit's ownership or the repair's actual cost (CLG bills an owner-operator
// for damage to company equipment too, not just their own truck) -- see
// 20260911010000_owner_operator_chargeback_amount.sql. Company drivers are
// still charged back at actual cost, same as before that setting existed.
export function useDeductions(range) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [settingsRes, ordersRes] = await Promise.all([
      supabase.from("app_settings").select("owner_operator_chargeback_amount").single(),
      (() => {
        let query = supabase
          .from("work_orders")
          .select(
            "id, chargeback_driver_name, chargeback_driver_id, category, description, complaint, cost, date_opened, date_closed, " +
            "invoice_ref, po_number, unit:units(number), vendor:vendors(name), driver:drivers(driver_type)"
          )
          .eq("is_chargeback", true)
          .eq("voided", false)
          .order("date_opened", { ascending: false });
        if (range?.start) query = query.gte("date_opened", range.start);
        if (range?.end) query = query.lte("date_opened", range.end);
        return query;
      })(),
    ]);

    if (ordersRes.error) {
      setError(ordersRes.error.message);
      setRecords([]);
    } else {
      const flatAmount = settingsRes.data?.owner_operator_chargeback_amount;
      setRecords(
        (ordersRes.data ?? []).map((r) => {
          const isOwnerOperator = r.driver?.driver_type === "OWNER_OPERATOR";
          const flatRateApplied = isOwnerOperator && flatAmount != null;
          const billedAmount = flatRateApplied ? Number(flatAmount) : Number(r.cost) || 0;
          return { ...r, isOwnerOperator, flatRateApplied, billedAmount };
        })
      );
    }
    setLoading(false);
  }, [range?.start, range?.end]);

  useEffect(() => {
    load();
  }, [load]);

  return { records, loading, error, reload: load };
}
