import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Keyed by wo_number, not work_order_id -- a deleted work order's log
// rows have work_order_id set null (ON DELETE SET NULL) but keep their
// wo_number, so this still works for "what happened to WO-1234 before it
// was deleted" if ever looked up directly. The modal itself only ever has
// a live order (so always has both ids), but wo_number is the more
// durable key.
export function useWorkOrderActivityLog(woNumber) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!woNumber) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("work_order_activity_log")
      .select("id, action, actor, detail, created_at")
      .eq("wo_number", woNumber)
      .order("created_at", { ascending: false });
    if (err) { setError(err.message); setEntries([]); } else { setEntries(data ?? []); }
    setLoading(false);
  }, [woNumber]);

  useEffect(() => { load(); }, [load]);

  return { entries, loading, error, reload: load };
}
