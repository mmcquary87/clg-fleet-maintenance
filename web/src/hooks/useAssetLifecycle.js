import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { recommend } from "../lib/assetLifecycle";

const DEFAULT_CONFIG = {
  asset_target_miles: 250000,
  asset_target_age_years: 2,
  asset_single_invoice_threshold: null,
  asset_reliability_categories: ["Engine", "Transmission"],
};

// Asset_Lifecycle_Disposal_Spec.md, phase 1: fetches everything the
// buy/sell recommendation needs for one unit (looked up by unit number,
// since that's what the Spend page's per-unit drill-down already has
// selected) and runs it through lib/assetLifecycle.js's pure calc. Comps
// and warranty-claim status are editable from here; the target-band and
// threshold config is admin-editable from Settings, read-only here.
export function useAssetLifecycle(unitNumber) {
  const [unit, setUnit] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [comps, setComps] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitNumber) {
      setUnit(null);
      setWorkOrders([]);
      setComps([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data: unitRow, error: unitErr } = await supabase
      .from("units")
      .select("id, number, year, odometer, in_service_date, warranty_status")
      .eq("number", unitNumber)
      .maybeSingle();
    if (unitErr || !unitRow) {
      setError(unitErr?.message || "Unit not found");
      setUnit(null);
      setLoading(false);
      return;
    }
    setUnit(unitRow);

    const [ordersRes, compsRes, configRes] = await Promise.all([
      supabase.from("work_orders")
        .select("id, category, cost, status, date_opened, date_closed, voided, warranty_claim_status")
        .eq("unit_id", unitRow.id)
        .order("date_opened", { ascending: false }),
      supabase.from("asset_market_comps")
        .select("id, source, pulled_at, comp_year, comp_make, comp_model, comp_engine, comp_mileage, comp_asking_price, entered_by")
        .eq("unit_id", unitRow.id)
        .order("pulled_at", { ascending: false }),
      supabase.from("app_settings")
        .select("asset_target_miles, asset_target_age_years, asset_single_invoice_threshold, asset_reliability_categories")
        .single(),
    ]);

    if (!ordersRes.error) setWorkOrders(ordersRes.data ?? []);
    if (!compsRes.error) setComps(compsRes.data ?? []);
    if (!configRes.error && configRes.data) setConfig(configRes.data);
    setLoading(false);
  }, [unitNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const addComp = async (fields) => {
    const { error: err } = await supabase.from("asset_market_comps").insert({ unit_id: unit.id, ...fields });
    if (!err) await load();
    return err;
  };

  const deleteComp = async (compId) => {
    const { error: err } = await supabase.from("asset_market_comps").delete().eq("id", compId);
    if (!err) await load();
    return err;
  };

  const setWarrantyClaimStatus = async (workOrderId, status) => {
    const { error: err } = await supabase.from("work_orders").update({ warranty_claim_status: status }).eq("id", workOrderId);
    if (!err) await load();
    return err;
  };

  const result = unit
    ? recommend({ unit, workOrders: workOrders.filter((w) => !w.voided), comps, config })
    : null;

  return { unit, workOrders, comps, config, result, loading, error, reload: load, addComp, deleteComp, setWarrantyClaimStatus };
}
