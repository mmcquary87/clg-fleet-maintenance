import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useUnits() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("units")
      .select("id, number, type, vin, is_active, current_location, created_at")
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
