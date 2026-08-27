import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const UNIT_SELECT =
  "id, number, type, vin, is_active, current_location, driver_name, odometer, " +
  "last_pm_date, pm_interval_days, last_annual_inspection_date, last_midtrip_date, midtrip_interval_days";

const ORDER_SELECT =
  "id, category, description, complaint, cost, status, date_opened, date_closed, " +
  "invoice_ref, is_chargeback, chargeback_driver_name, vendor:vendors(name)";

export function useUnitDetail(unitId) {
  const [unit, setUnit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) {
      setUnit(null);
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [unitRes, ordersRes] = await Promise.all([
      supabase.from("units").select(UNIT_SELECT).eq("id", unitId).single(),
      supabase.from("work_orders").select(ORDER_SELECT).eq("unit_id", unitId).order("date_opened", { ascending: false }),
    ]);
    if (unitRes.error) {
      setError(unitRes.error.message);
      setUnit(null);
    } else {
      setUnit(unitRes.data);
    }
    if (!ordersRes.error) setOrders(ordersRes.data ?? []);
    setLoading(false);
  }, [unitId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateSchedule = async (fields) => {
    const { error: err } = await supabase.from("units").update(fields).eq("id", unitId);
    if (!err) await load();
    return err;
  };

  return { unit, orders, loading, error, reload: load, updateSchedule };
}
