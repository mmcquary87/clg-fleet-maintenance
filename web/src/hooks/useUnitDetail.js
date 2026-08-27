import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const UNIT_SELECT =
  "id, number, type, vin, is_active, current_location, driver_name, odometer, " +
  "year, make, model, fuel_type, last_fuel_percent, samsara_synced_at, load_trip_id, domicile, warranty_status, " +
  "last_pm_date, pm_interval_days, last_annual_inspection_date, last_midtrip_date, midtrip_interval_days";

const ORDER_SELECT =
  "id, category, description, complaint, cost, status, date_opened, date_closed, " +
  "invoice_ref, is_chargeback, chargeback_driver_name, vendor:vendors(name)";

export function useUnitDetail(unitId) {
  const [unit, setUnit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [openDefects, setOpenDefects] = useState([]);
  const [recentFaults, setRecentFaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) {
      setUnit(null);
      setOrders([]);
      setOpenDefects([]);
      setRecentFaults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [unitRes, ordersRes, defectsRes, faultsRes] = await Promise.all([
      supabase.from("units").select(UNIT_SELECT).eq("id", unitId).single(),
      supabase.from("work_orders").select(ORDER_SELECT).eq("unit_id", unitId).order("date_opened", { ascending: false }),
      supabase.from("dvir_defects").select("id, defect_type, created_at").eq("unit_id", unitId).eq("is_resolved", false)
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("fault_events").select("id, dtc_code, dtc_description, samsara_reading_time, light_severity")
        .eq("unit_id", unitId).order("samsara_reading_time", { ascending: false }).limit(5),
    ]);
    if (unitRes.error) {
      setError(unitRes.error.message);
      setUnit(null);
    } else {
      setUnit(unitRes.data);
    }
    if (!ordersRes.error) setOrders(ordersRes.data ?? []);
    if (!defectsRes.error) setOpenDefects(defectsRes.data ?? []);
    if (!faultsRes.error) setRecentFaults(faultsRes.data ?? []);
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

  return { unit, orders, openDefects, recentFaults, loading, error, reload: load, updateSchedule };
}
