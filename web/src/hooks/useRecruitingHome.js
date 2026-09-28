import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const CLOSED_STATUSES = ["disqualified", "lost", "do_not_contact", "signed"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SOON_MS = 14 * 24 * 60 * 60 * 1000;

// The schema's 10 lead_status values collapse to the 6 buckets the Home
// status bar shows (design handoff, "By status"): closed/exit statuses
// (disqualified/lost/do_not_contact) aren't part of the active-pipeline
// flow this chart tells, and "signed" merges into "converted" alongside
// "onboarding" since both mean the lead has moved past raw lead-status
// into its own onboarding case.
const STATUS_BUCKET = {
  new: "new", enriched: "enriched", qualified: "qualified", contacted: "contacted",
  in_conversation: "in_conversation", onboarding: "converted", signed: "converted",
};
const STATUS_BUCKET_ORDER = ["new", "enriched", "qualified", "contacted", "in_conversation", "converted"];

export function useRecruitingHome() {
  const [leads, setLeads] = useState([]);
  const [openFlagLeadIds, setOpenFlagLeadIds] = useState(new Set());
  const [overdueCases, setOverdueCases] = useState([]);
  const [soonCases, setSoonCases] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const soonCutoff = new Date(now.getTime() + SOON_MS).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const [leadsRes, flagsRes, casesRes, historyRes, convRes] = await Promise.all([
      supabase.from("leads").select("id, segment, status, legal_name, dba_name, contact_name, created_at"),
      // Review-severity only, matching the Leads list's own "open review
      // flags" count -- a disqualifying flag already surfaces via the
      // lead's disqualified status elsewhere, so it isn't double-counted
      // here as a separate thing needing attention.
      supabase.from("lead_vetting_flags").select("lead_id").eq("state", "open").eq("severity", "review"),
      supabase.from("onboarding_board").select("*").eq("status", "open"),
      supabase.from("lead_status_history").select("lead_id, from_status, to_status, changed_at").order("changed_at", { ascending: false }).limit(15),
      supabase.from("lead_conversations").select("lead_id, occurred_at, channel, direction, summary").order("occurred_at", { ascending: false }).limit(15),
    ]);
    if (leadsRes.error) {
      setError(leadsRes.error.message);
      setLoading(false);
      return;
    }

    setLeads(leadsRes.data ?? []);
    setOpenFlagLeadIds(new Set((flagsRes.data ?? []).map((f) => f.lead_id)));

    const cases = casesRes.data ?? [];
    setOverdueCases(cases.filter((c) => (c.overdue_steps ?? 0) > 0));
    setSoonCases(cases.filter((c) => c.target_start && c.target_start >= today && c.target_start <= soonCutoff));

    const leadNames = Object.fromEntries((leadsRes.data ?? []).map((l) => [l.id, l.legal_name || l.dba_name || l.contact_name || "Unnamed lead"]));
    const historyEvents = (historyRes.data ?? []).map((h) => ({
      kind: "status", leadId: h.lead_id, at: h.changed_at,
      text: (leadNames[h.lead_id] || "A lead") + (h.from_status ? " moved from " + h.from_status.replace(/_/g, " ") + " to " + h.to_status.replace(/_/g, " ") : " entered " + h.to_status.replace(/_/g, " ")),
    }));
    const convEvents = (convRes.data ?? []).map((c) => ({
      kind: "conversation", leadId: c.lead_id, at: c.occurred_at,
      text: (leadNames[c.lead_id] || "A lead") + " — " + c.channel + " " + c.direction + ": " + c.summary,
    }));
    setActivity([...historyEvents, ...convEvents].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10));

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeLeads = leads.filter((l) => !CLOSED_STATUSES.includes(l.status));
  const segmentStats = {};
  for (const seg of ["new_mc", "small_fleet", "driver"]) {
    const inSeg = leads.filter((l) => l.segment === seg);
    const activeInSeg = inSeg.filter((l) => !CLOSED_STATUSES.includes(l.status));
    segmentStats[seg] = {
      active: activeInSeg.length,
      openFlags: activeInSeg.filter((l) => openFlagLeadIds.has(l.id)).length,
      addedThisWeek: inSeg.filter((l) => l.created_at && new Date(l.created_at).getTime() >= Date.now() - WEEK_MS).length,
    };
  }

  const statusCounts = Object.fromEntries(STATUS_BUCKET_ORDER.map((b) => [b, 0]));
  for (const l of activeLeads) {
    const bucket = STATUS_BUCKET[l.status];
    if (bucket) statusCounts[bucket] += 1;
  }

  const flaggedActiveCount = activeLeads.filter((l) => openFlagLeadIds.has(l.id)).length;

  return {
    loading, error,
    activeCount: activeLeads.length,
    segmentStats,
    statusCounts,
    flaggedLeads: activeLeads.filter((l) => openFlagLeadIds.has(l.id)),
    flaggedActiveCount,
    overdueCases,
    soonCases,
    activity,
    reload: load,
  };
}
