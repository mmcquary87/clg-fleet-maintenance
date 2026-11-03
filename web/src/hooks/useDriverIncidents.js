import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { COACHING_STAGES, SEVERITIES } from "../lib/accountabilityEnums";

const MONTH_LABEL = { month: "short", year: "2-digit" };

// Rolling 12 calendar months ending with the current one (oldest first) --
// same "trailing 12 months" shape as the old Accountability Center
// workbook's Dashboard tab, not a calendar-year Jan-Dec table.
function last12Months() {
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString(undefined, MONTH_LABEL) });
  }
  return months;
}

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
    .slice(0, 10)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  const coachingStageCounts = Object.fromEntries(
    COACHING_STAGES.map((s) => [s, incidents.filter((i) => i.coaching_stage === s).length]),
  );

  // Violation family isn't a fixed enum (accountability_infractions.violation_family
  // is free text, admin-editable in Settings) -- built from whatever families
  // actually appear, not a hardcoded list that could drift from the catalog.
  const byFamily = new Map();
  incidents.forEach((i) => {
    if (i.violation_family) byFamily.set(i.violation_family, (byFamily.get(i.violation_family) ?? 0) + 1);
  });
  const violationFamilyCounts = Array.from(byFamily.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const monthlyTrend = last12Months().map(({ key, label }) => ({
    key,
    label,
    count: incidents.filter((i) => i.event_date?.slice(0, 7) === key).length,
  }));

  const totals = {
    totalIncidents: incidents.length,
    severityCounts,
    coachingStageCounts,
    violationFamilyCounts,
    monthlyTrend,
    finalWarningCount: coachingStageCounts["Final Warning"] ?? 0,
    terminationCount: coachingStageCounts["Termination"] ?? 0,
    fineEligibleCount: incidents.filter((i) => i.fine_eligibility === "Yes").length,
    reviewCount: incidents.filter((i) => i.fine_eligibility === "Review").length,
    pendingAppealsCount: incidents.filter((i) => i.appeal_status === "Pending").length,
    topDrivers,
  };

  return { incidents, totals, loading, error, reload: load, deleteIncident };
}
