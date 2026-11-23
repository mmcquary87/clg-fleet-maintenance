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

  // One summary row per driver for the "drivers" overview on the Accountability
  // screen. "Active" = still inside the infraction's own rollover window (the same
  // rule the coaching-stage ladder uses), so active points / current stage show who
  // needs attention now, while records is the all-time count.
  const today = new Date();
  const dayMs = 86400000;
  const byDriver = new Map();
  incidents.forEach((i) => {
    const key = i.driver_id ?? i.driver_name;
    const d = byDriver.get(key) ?? {
      driver_id: i.driver_id, driver_name: i.driver_name, records: 0, last60: 0, activePoints: 0, stageRank: -1,
      families: new Map(), lastDate: null, lastInfraction: null, score: null, fleetAvg: null, fineEligible: 0, pendingAppeals: 0,
    };
    d.records += 1;
    const ageDays = i.event_date ? (today - new Date(i.event_date + "T00:00:00")) / dayMs : Infinity;
    if (ageDays <= 60) d.last60 += 1;
    if (ageDays <= (Number(i.rollover_days) || 60)) {
      d.activePoints += Number(i.points) || 0;
      d.stageRank = Math.max(d.stageRank, COACHING_STAGES.indexOf(i.coaching_stage));
    }
    if (i.violation_family) d.families.set(i.violation_family, (d.families.get(i.violation_family) ?? 0) + 1);
    if (i.event_date && (!d.lastDate || i.event_date > d.lastDate)) { d.lastDate = i.event_date; d.lastInfraction = i.infraction_name; }
    d.score = i.driver_score != null ? Number(i.driver_score) : d.score;
    d.fleetAvg = i.fleet_average_score != null ? Number(i.fleet_average_score) : d.fleetAvg;
    if (i.fine_eligibility === "Yes") d.fineEligible += 1;
    if (i.appeal_status === "Pending") d.pendingAppeals += 1;
    byDriver.set(key, d);
  });
  const driverSummaries = Array.from(byDriver.values()).map((d) => {
    const [topFamily, topFamilyCount] = Array.from(d.families.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return {
      ...d,
      activePoints: Math.round(d.activePoints * 100) / 100,
      currentStage: d.stageRank >= 0 ? COACHING_STAGES[d.stageRank] : null,
      topFamily, topFamilyCount,
    };
  });

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
    driverSummaries,
  };

  return { incidents, totals, loading, error, reload: load, deleteIncident };
}
