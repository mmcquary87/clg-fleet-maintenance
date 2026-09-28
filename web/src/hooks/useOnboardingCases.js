import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Onboarding cases list -- reads the onboarding_board view (already
// aggregates required/done/overdue step counts and the recruit/account/
// owner names server-side, see 20260927040200_recruiting_governance.sql).
export function useOnboardingCases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("onboarding_board")
      .select("*")
      .order("opened_at", { ascending: false });
    if (err) {
      setError(err.message);
      setCases([]);
    } else {
      setCases(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { cases, loading, error, reload: load };
}
