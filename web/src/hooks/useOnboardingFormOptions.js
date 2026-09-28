import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Options for the "New onboarding case" form: templates (any status -- a
// draft one can still be picked, it just can never clear the case until
// approved), accounts, and contacts.
export function useOnboardingFormOptions() {
  const [templates, setTemplates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [templatesRes, accountsRes, contactsRes] = await Promise.all([
        supabase.from("onboarding_templates").select("id, pathway, version, status").order("pathway"),
        supabase.from("accounts").select("id, legal_name, dba_name").order("legal_name"),
        supabase.from("contacts").select("id, first_name, last_name, account_id").order("last_name"),
      ]);
      setTemplates(templatesRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
      setContacts(contactsRes.data ?? []);
      setLoading(false);
    })();
  }, []);

  return { templates, accounts, contacts, loading };
}
