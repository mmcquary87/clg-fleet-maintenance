import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Accounts list -- the accounts table's own fields plus a contact count
// and an onboarding case count per account (computed client-side; account
// volume is small enough that this is simpler than a dedicated view).
export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [accountsRes, contactsRes, casesRes, profilesRes] = await Promise.all([
      supabase.from("accounts").select("*").order("legal_name"),
      supabase.from("contacts").select("account_id").not("account_id", "is", null),
      supabase.from("onboarding_cases").select("account_id").not("account_id", "is", null),
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (accountsRes.error) {
      setError(accountsRes.error.message);
      setAccounts([]);
      setLoading(false);
      return;
    }
    const contactCounts = {};
    for (const c of contactsRes.data ?? []) contactCounts[c.account_id] = (contactCounts[c.account_id] || 0) + 1;
    const caseCounts = {};
    for (const c of casesRes.data ?? []) caseCounts[c.account_id] = (caseCounts[c.account_id] || 0) + 1;
    const nameById = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));

    setAccounts((accountsRes.data ?? []).map((a) => ({
      ...a,
      contactCount: contactCounts[a.id] || 0,
      caseCount: caseCounts[a.id] || 0,
      ownerName: nameById[a.owner_id] || null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { accounts, loading, error, reload: load };
}
