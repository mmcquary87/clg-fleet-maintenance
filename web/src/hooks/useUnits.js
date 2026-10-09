import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { withMidtripIntervalDefault } from "../lib/maintenanceSchedule";

// Shared by every write path that can set last_midtrip_date (the mid-trip
// inspection form, closing a new/existing work order) so filing a mid-trip
// always gets a usable Next Due date without a separate manual save on the
// unit's Service tab. Only fetches the unit's current interval when a
// mid-trip date is actually part of this update.
export async function updateUnitMaintenanceFields(unitId, fields) {
  let finalFields = fields;
  if (fields.last_midtrip_date != null) {
    const { data } = await supabase.from("units").select("midtrip_interval_days").eq("id", unitId).single();
    finalFields = withMidtripIntervalDefault(data?.midtrip_interval_days, fields);
  }
  return supabase.from("units").update(finalFields).eq("id", unitId);
}

export function useUnits() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("units")
      .select(
        "id, number, type, vin, is_active, current_location, created_at, odometer, can_move_load, idle_since, " +
        "last_pm_date, pm_interval_days, last_annual_inspection_date, last_midtrip_date, midtrip_interval_days, " +
        "ownership, owner_operator_assigned, plate_number, current_market_value, domicile, warranty_status, " +
        "issue_tag, issue_tag_note"
      )
      .order("number", { ascending: true });
    if (err) {
      setError(err.message);
      setUnits([]);
    } else {
      setUnits(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (id, isActive) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, is_active: isActive } : u)));
    const { error: err } = await supabase.from("units").update({ is_active: isActive }).eq("id", id);
    if (err) load(); // revert to server state on failure
  };

  return { units, loading, error, reload: load, toggleActive };
}
