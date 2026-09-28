import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Tasks, optionally scoped to one lead or one onboarding case (for the
// Tasks panel on their detail views) or to the current user (for the
// global Tasks view's "Mine" filter). Owner names are resolved from
// profiles the same way other recruiting hooks do it.
export function useTasks({ leadId, caseId, ownerId, statusFilter } = {}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false });
    if (leadId) query = query.eq("lead_id", leadId);
    if (caseId) query = query.eq("case_id", caseId);
    if (ownerId) query = query.eq("owner_id", ownerId);
    if (statusFilter) query = query.eq("status", statusFilter);

    const [tasksRes, profilesRes] = await Promise.all([
      query,
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (tasksRes.error) {
      setError(tasksRes.error.message);
      setTasks([]);
      setLoading(false);
      return;
    }
    const nameById = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    const taskRows = tasksRes.data ?? [];

    // Not scoped to a single record (the global Tasks view) -- resolve
    // what each task is attached to, for display.
    let leadNameById = {};
    let caseNameById = {};
    if (!leadId && !caseId) {
      const taskLeadIds = [...new Set(taskRows.filter((t) => t.lead_id).map((t) => t.lead_id))];
      const taskCaseIds = [...new Set(taskRows.filter((t) => t.case_id).map((t) => t.case_id))];
      const [leadsRes, casesRes] = await Promise.all([
        taskLeadIds.length ? supabase.from("leads").select("id, legal_name, dba_name, contact_name").in("id", taskLeadIds) : Promise.resolve({ data: [] }),
        taskCaseIds.length ? supabase.from("onboarding_board").select("id, recruit, account").in("id", taskCaseIds) : Promise.resolve({ data: [] }),
      ]);
      leadNameById = Object.fromEntries((leadsRes.data ?? []).map((l) => [l.id, l.legal_name || l.dba_name || l.contact_name || "Unnamed lead"]));
      caseNameById = Object.fromEntries((casesRes.data ?? []).map((c) => [c.id, c.recruit || c.account || "Unnamed case"]));
    }

    setTasks(taskRows.map((t) => ({
      ...t,
      ownerName: nameById[t.owner_id] || null,
      recordName: t.lead_id ? leadNameById[t.lead_id] : t.case_id ? caseNameById[t.case_id] : null,
    })));
    setLoading(false);
  }, [leadId, caseId, ownerId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return { tasks, loading, error, reload: load };
}
