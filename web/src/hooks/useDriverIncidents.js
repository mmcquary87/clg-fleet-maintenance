import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SEVERITIES = ["Minor", "Moderate", "Heavy", "Severe"];

export function useDriverIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("driver_incident_detail")
      .select("*")
      .order("event_date", { ascending: false });

    if (err) {
      setError(err.message);
      setIncidents([]);
    } else {
      setIncidents(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deleteIncident = async (id) => {
    const { error: err } = await supabase.from("driver_incidents").delete().eq("id", id);
    if (err) throw err;
    await load();
  };

  const severityCounts = Object.fromEntries(
    SEVERITIES.map((s) => [s, incidents.filter((i) => i.severity === s).length]),
  );

  const byDriver = new Map();
  incidents.forEach((i) => {
    byDriver.set(i.driver_name, (byDriver.get(i.driver_name) ?? 0) + 1);
  });
  const topDrivers = Array.from(byDriver.entries())
    .map(([driver_name, count]) => ({ driver_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totals = {
    totalIncidents: incidents.length,
    severityCounts,
    fineEligibleCount: incidents.filter((i) => i.fine_eligibility === "Yes").length,
    reviewCount: incidents.filter((i) => i.fine_eligibility === "Review").length,
    pendingAppealsCount: incidents.filter((i) => i.appeal_status === "Pending").length,
    topDrivers,
  };

  return { incidents, totals, loading, error, reload: load, deleteIncident };
}
