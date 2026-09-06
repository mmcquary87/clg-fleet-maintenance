import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Fleet-wide "invisible until it's in the shop" signal (Growth Roadmap
// Tier 1): a fault code or DVIR defect can sit on a unit for weeks with no
// work order ever opened against it, so nothing on the Units page today
// shows it's there. Two things worth flagging separately:
//   - an unaddressed reading right now (fault_events.status === "new", or
//     a dvir_defect with is_resolved === false and no matched work order)
//   - a code that's come back more than once in the last 90 days, which is
//     a much stronger "this is heading toward a real failure" signal than
//     a single reading, even after that reading's been actioned.
const SEVERITY_RANK = { red: 3, amber: 2, yellow: 1 };
const LOOKBACK_DAYS = 90;

export function useUnitFaults() {
  const [byUnitId, setByUnitId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

    const [faultsRes, defectsRes] = await Promise.all([
      supabase
        .from("fault_events")
        .select("unit_id, dtc_code, dtc_description, light_severity, status, samsara_reading_time")
        .gte("samsara_reading_time", since),
      supabase
        .from("dvir_defects")
        .select("unit_id, defect_type, is_resolved, matched_work_order_id, created_at")
        .eq("is_resolved", false)
        .is("matched_work_order_id", null),
    ]);

    if (faultsRes.error || defectsRes.error) {
      setError(faultsRes.error?.message || defectsRes.error?.message);
      setByUnitId({});
      setLoading(false);
      return;
    }

    const m = {};
    const bucket = (unitId) => (m[unitId] ??= {
      activeSeverity: null, activeCode: null, activeDescription: null,
      codeCounts: new Map(), openDefectCount: 0,
    });

    for (const f of faultsRes.data ?? []) {
      const v = bucket(f.unit_id);
      v.codeCounts.set(f.dtc_code, (v.codeCounts.get(f.dtc_code) ?? 0) + 1);
      if (f.status !== "new") continue;
      const rank = SEVERITY_RANK[f.light_severity] ?? 0;
      if (!v.activeSeverity || rank > (SEVERITY_RANK[v.activeSeverity] ?? 0)) {
        v.activeSeverity = f.light_severity ?? "yellow";
        v.activeCode = f.dtc_code;
        v.activeDescription = f.dtc_description;
      }
    }
    for (const d of defectsRes.data ?? []) {
      const v = bucket(d.unit_id);
      v.openDefectCount += 1;
    }

    const result = {};
    for (const [unitId, v] of Object.entries(m)) {
      const repeatCode = [...v.codeCounts.entries()].find(([, count]) => count >= 3);
      result[unitId] = {
        activeSeverity: v.activeSeverity,
        activeCode: v.activeCode,
        activeDescription: v.activeDescription,
        openDefectCount: v.openDefectCount,
        repeatCode: repeatCode ? { code: repeatCode[0], count: repeatCode[1] } : null,
      };
    }
    setByUnitId(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { byUnitId, loading, error, reload: load };
}
