import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// A single account's detail: the row, the lead it was converted from (if
// any), its contacts, its onboarding cases (via the onboarding_board view,
// same as the Onboarding list), and its campaign memberships -- reached
// either through one of its contacts or through its originating lead.
export function useAccountDetail(accountId) {
  const [account, setAccount] = useState(null);
  const [originatingLead, setOriginatingLead] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [cases, setCases] = useState([]);
  const [campaignMemberships, setCampaignMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);

    const { data: accountRow, error: accErr } = await supabase.from("accounts").select("*").eq("id", accountId).single();
    if (accErr) {
      setError(accErr.message);
      setLoading(false);
      return;
    }
    setAccount(accountRow);

    const [leadRes, contactsRes, casesRes] = await Promise.all([
      accountRow.converted_from_lead_id
        ? supabase.from("leads").select("id, legal_name, dba_name, status").eq("id", accountRow.converted_from_lead_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("contacts").select("*").eq("account_id", accountId).order("last_name"),
      // Raw table, not the onboarding_board view -- that view only exposes
      // the account's NAME (a join for display), not its id, so filtering
      // by account_id has to go straight to the source table.
      supabase.from("onboarding_cases").select("id, pathway, status, current_stage, target_start, opened_at").eq("account_id", accountId).order("opened_at", { ascending: false }),
    ]);
    setOriginatingLead(leadRes.data ?? null);
    setContacts(contactsRes.data ?? []);
    setCases(casesRes.data ?? []);

    const contactIds = (contactsRes.data ?? []).map((c) => c.id);
    const orFilters = [contactIds.length ? "contact_id.in.(" + contactIds.join(",") + ")" : null, accountRow.converted_from_lead_id ? "lead_id.eq." + accountRow.converted_from_lead_id : null].filter(Boolean);
    if (orFilters.length) {
      const { data: members } = await supabase.from("campaign_members").select("id, campaign_id, status, tier, campaigns(name, status)").or(orFilters.join(","));
      setCampaignMemberships(members ?? []);
    } else {
      setCampaignMemberships([]);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    setAccount(null);
    setOriginatingLead(null);
    setContacts([]);
    setCases([]);
    setCampaignMemberships([]);
    load();
  }, [accountId, load]);

  return { account, originatingLead, contacts, cases, campaignMemberships, loading, error, reload: load };
}
