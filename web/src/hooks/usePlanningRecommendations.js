import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// planning_recommendations is the one channel the externally-run
// freight-planning agent team writes through (insert-only, enforced by
// RLS -- see 20261111020000_planning_recommendations.sql). This hook is
// the human-triage side: a dispatcher/operations/admin user accepts or
// dismisses what the agents propose. Nothing here ever reaches Alvys or
// a driver directly -- accepting a recommendation just records that a
// human reviewed and agreed with it.
export function usePlanningRecommendations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("planning_recommendations")
      .select("id, agent_role, title, detail, payload, priority, related_unit_id, related_driver_id, related_load_number, status, created_at, reviewed_at, unit:units(number, type), driver:drivers(name)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = useCallback(async (id, status) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("planning_recommendations")
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (!err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, reviewed_at: new Date().toISOString() } : r)));
    }
    return err;
  }, []);

  const totals = {
    total: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    urgent: rows.filter((r) => r.status === "open" && r.priority === "urgent").length,
    byAgent: rows
      .filter((r) => r.status === "open")
      .reduce((acc, r) => { acc[r.agent_role] = (acc[r.agent_role] ?? 0) + 1; return acc; }, {}),
  };

  return { rows, totals, loading, error, reload: load, accept: (id) => review(id, "accepted"), dismiss: (id) => review(id, "dismissed") };
}
