import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// A single onboarding case's full detail: the case row, its template
// (governs whether the clear-to-dispatch gate can ever pass), its steps in
// stage/sequence order, and the account/contact it's for.
export function useOnboardingCaseDetail(caseId) {
  const [caseRow, setCaseRow] = useState(null);
  const [template, setTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [account, setAccount] = useState(null);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);

    const { data: c, error: caseErr } = await supabase.from("onboarding_cases").select("*").eq("id", caseId).single();
    if (caseErr) {
      setError(caseErr.message);
      setLoading(false);
      return;
    }
    setCaseRow(c);

    const [templateRes, stepsRes, accountRes, contactRes] = await Promise.all([
      supabase.from("onboarding_templates").select("id, pathway, version, status, approved_by, approved_on, notes").eq("id", c.template_id).single(),
      supabase.from("onboarding_case_steps").select("*").eq("case_id", caseId).order("stage", { ascending: true }).order("sequence", { ascending: true }),
      c.account_id ? supabase.from("accounts").select("id, legal_name, dba_name").eq("id", c.account_id).single() : Promise.resolve({ data: null }),
      c.contact_id ? supabase.from("contacts").select("id, first_name, last_name, phone, email").eq("id", c.contact_id).single() : Promise.resolve({ data: null }),
    ]);
    setTemplate(templateRes.data ?? null);
    setSteps(stepsRes.data ?? []);
    setAccount(accountRes.data ?? null);
    setContact(contactRes.data ?? null);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  return { caseRow, template, steps, account, contact, loading, error, reload: load };
}
