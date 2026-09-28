import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Contacts list -- joined to their account's name for display.
export function useContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("contacts").select("*, accounts(legal_name, dba_name)").order("last_name");
    if (err) {
      setError(err.message);
      setContacts([]);
    } else {
      setContacts((data ?? []).map((c) => ({ ...c, accountName: c.accounts?.legal_name || c.accounts?.dba_name || null })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { contacts, loading, error, reload: load };
}
