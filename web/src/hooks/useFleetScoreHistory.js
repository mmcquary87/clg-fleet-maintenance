import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useFleetScoreHistory() {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("fleet_score_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: true })
      .limit(56); // 8 weeks of daily snapshots

    if (err) {
      setError(err.message);
      setSnapshots([]);
    } else {
      setSnapshots(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const changeSinceFirst = first?.fleet_average_score != null && last?.fleet_average_score != null
    ? last.fleet_average_score - first.fleet_average_score
    : null;

  return { snapshots, changeSinceFirst, loading, error, reload: load };
}
