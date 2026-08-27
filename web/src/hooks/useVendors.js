import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useVendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("vendors")
      .select("id, name, specialty_category, contact, contact_name, contact_email, created_at")
      .order("name", { ascending: true });
    if (err) {
      setError(err.message);
      setVendors([]);
    } else {
      setVendors(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { vendors, loading, error, reload: load };
}
