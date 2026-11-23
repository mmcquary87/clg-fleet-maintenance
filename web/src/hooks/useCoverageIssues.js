import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Problems with how complete the Samsara-sourced scoring data is (an active
// truck not linked to Samsara, a stalled sync, speeding events with no driver,
// a driver with miles but no speeding data). See
// 20261123010000_samsara_coverage_issues_view.sql for the exact checks. The
// view returns no rows when everything is healthy.
//
// A failure to load the check is not shown as "all clear": it surfaces as
// `error` so the banner can say the check itself couldn't run.
export function useCoverageIssues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("samsara_coverage_issues")
        .select("severity, kind, subject, detail")
        .order("severity", { ascending: true })
        .order("kind", { ascending: true })
        .order("subject", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setIssues([]);
      } else {
        setIssues(data ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { issues, loading, error };
}
