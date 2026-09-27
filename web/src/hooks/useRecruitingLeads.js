import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const LEAD_COLUMNS = "id, segment, status, source_code, dot_number, mc_number, legal_name, dba_name, contact_name, phone, email, city, state, fit_score, score_status, score_coverage, disqualified_reason, owner_id, rating, tier, created_at, updated_at";

// Recruiting Leads list -- the leads table plus a per-lead count of open
// vetting flags (severity-split) and a human-readable source label, both
// cheap enough to compute client-side rather than adding a view for a
// first pass.
export function useRecruitingLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [leadsRes, flagsRes, sourcesRes] = await Promise.all([
      supabase.from("leads").select(LEAD_COLUMNS)
        .order("segment", { ascending: true })
        .order("fit_score", { ascending: false, nullsFirst: false }),
      supabase.from("lead_vetting_flags").select("lead_id, severity").eq("state", "open"),
      supabase.from("lead_sources").select("code, description"),
    ]);
    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setLeads([]);
      setLoading(false);
      return;
    }

    const flagCounts = {};
    for (const f of flagsRes.data ?? []) {
      const bucket = flagCounts[f.lead_id] || { review: 0, disqualifying: 0, info: 0 };
      bucket[f.severity] = (bucket[f.severity] || 0) + 1;
      flagCounts[f.lead_id] = bucket;
    }
    const sourceLabels = Object.fromEntries((sourcesRes.data ?? []).map((s) => [s.code, s.description]));

    setLeads((leadsRes.data ?? []).map((l) => ({
      ...l,
      sourceLabel: sourceLabels[l.source_code] || l.source_code,
      openReviewFlags: flagCounts[l.id]?.review ?? 0,
      openInfoFlags: flagCounts[l.id]?.info ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { leads, loading, error, reload: load };
}
