import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// A lead's full detail on demand: the lead row itself, its most recent
// FMCSA carrier snapshot (if any), every vetting flag ever raised (not
// just open ones -- a recruiter reviewing a lead needs the history), and
// its conversation log.
export function useLeadDetail(leadId) {
  const [lead, setLead] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [flags, setFlags] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [convertedAccount, setConvertedAccount] = useState(null);
  const [convertedContact, setConvertedContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);

    const { data: leadRow, error: leadErr } = await supabase.from("leads").select("*").eq("id", leadId).single();
    if (leadErr) {
      setError(leadErr.message);
      setLoading(false);
      return;
    }
    setLead(leadRow);

    const [snapRes, flagsRes, convRes, accRes, contactRes] = await Promise.all([
      leadRow.latest_snapshot_id
        ? supabase.from("carrier_snapshots").select("*").eq("id", leadRow.latest_snapshot_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("lead_vetting_flags")
        .select("id, flag_code, severity, state, detail, raised_at, resolved_at, resolved_by, resolution_note")
        .eq("lead_id", leadId).order("raised_at", { ascending: false }),
      supabase.from("lead_conversations")
        .select("id, occurred_at, channel, direction, author, summary, next_step, next_step_due")
        .eq("lead_id", leadId).order("occurred_at", { ascending: false }),
      leadRow.converted_account_id
        ? supabase.from("accounts").select("id, legal_name, dba_name").eq("id", leadRow.converted_account_id).single()
        : Promise.resolve({ data: null }),
      leadRow.converted_contact_id
        ? supabase.from("contacts").select("id, first_name, last_name").eq("id", leadRow.converted_contact_id).single()
        : Promise.resolve({ data: null }),
    ]);
    setSnapshot(snapRes.data ?? null);
    setFlags(flagsRes.data ?? []);
    setConversations(convRes.data ?? []);
    setConvertedAccount(accRes.data ?? null);
    setConvertedContact(contactRes.data ?? null);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    setLead(null);
    setSnapshot(null);
    setFlags([]);
    setConversations([]);
    setConvertedAccount(null);
    setConvertedContact(null);
    load();
  }, [leadId, load]);

  return { lead, snapshot, flags, conversations, convertedAccount, convertedContact, loading, error, reload: load };
}
