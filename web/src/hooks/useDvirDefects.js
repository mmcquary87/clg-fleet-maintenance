import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const WINDOW_DAYS = 30; // matches samsara-sync's own DVIR pull window

export function useDvirDefects() {
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

    const { data, error: err } = await supabase
      .from("dvir_defects")
      .select("id, defect_type, comment, is_resolved, created_at, resolved_at, resolved_by_name, resolved_by_type, unit:units(number, type), driver:drivers(name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
      setDefects([]);
    } else {
      setDefects(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = {
    total: defects.length,
    open: defects.filter((d) => !d.is_resolved).length,
    resolved: defects.filter((d) => d.is_resolved).length,
    linkedToDriver: defects.filter((d) => d.driver).length,
  };

  return { defects, totals, loading, error, reload: load };
}
