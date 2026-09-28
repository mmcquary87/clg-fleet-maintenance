import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useContactDetail(contactId) {
  const [contact, setContact] = useState(null);
  const [account, setAccount] = useState(null);
  const [campaignMemberships, setCampaignMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setError(null);

    const { data: contactRow, error: contactErr } = await supabase.from("contacts").select("*").eq("id", contactId).single();
    if (contactErr) {
      setError(contactErr.message);
      setLoading(false);
      return;
    }
    setContact(contactRow);

    const [accountRes, membersRes] = await Promise.all([
      contactRow.account_id ? supabase.from("accounts").select("id, legal_name, dba_name").eq("id", contactRow.account_id).single() : Promise.resolve({ data: null }),
      supabase.from("campaign_members").select("id, status, tier, campaigns(id, name, status)").eq("contact_id", contactId),
    ]);
    setAccount(accountRes.data ?? null);
    setCampaignMemberships(membersRes.data ?? []);
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    setContact(null);
    setAccount(null);
    setCampaignMemberships([]);
    load();
  }, [contactId, load]);

  return { contact, account, campaignMemberships, loading, error, reload: load };
}
