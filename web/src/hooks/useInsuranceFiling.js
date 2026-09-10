import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function toDateKey(monthDate) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString().slice(0, 10);
}

// Real persisted "has this reporting month been filed" state -- see
// 20260910010000_insurance_filings.sql for why this needs a table instead
// of just a button that does nothing durable.
export function useInsuranceFiling(reportingMonth) {
  const [filing, setFiling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("insurance_filings")
      .select("reporting_month, filed_at, fleet_mileage, equipment_value, estimated_premium")
      .eq("reporting_month", toDateKey(reportingMonth))
      .maybeSingle();
    if (err) setError(err.message);
    setFiling(data ?? null);
    setLoading(false);
  }, [reportingMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const markFiled = async ({ fleetMileage, equipmentValue, estimatedPremium }) => {
    setSaving(true);
    setError(null);
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error: err } = await supabase
      .from("insurance_filings")
      .upsert({
        reporting_month: toDateKey(reportingMonth),
        filed_by: userRes?.user?.id ?? null,
        filed_at: new Date().toISOString(),
        fleet_mileage: Math.round(fleetMileage),
        equipment_value: equipmentValue,
        estimated_premium: estimatedPremium,
      }, { onConflict: "reporting_month" })
      .select()
      .single();
    setSaving(false);
    if (err) { setError(err.message); return err.message; }
    setFiling(data);
    return null;
  };

  return { filing, loading, saving, error, markFiled, reload: load };
}
