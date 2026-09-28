import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// A single campaign's detail: the campaign row, its funnel counts, and its
// member list (each a lead or a contact, resolved to a display name).
export function useCampaignDetail(campaignId) {
  const [campaign, setCampaign] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);

    const { data: campaignRow, error: campErr } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
    if (campErr) {
      setError(campErr.message);
      setLoading(false);
      return;
    }
    setCampaign(campaignRow);

    const [funnelRes, membersRes] = await Promise.all([
      supabase.from("campaign_funnel").select("*").eq("id", campaignId).single(),
      supabase.from("campaign_members").select("id, lead_id, contact_id, status, tier, added_at").eq("campaign_id", campaignId).order("added_at", { ascending: false }),
    ]);
    setFunnel(funnelRes.data ?? null);

    const memberRows = membersRes.data ?? [];
    const leadIds = memberRows.filter((m) => m.lead_id).map((m) => m.lead_id);
    const contactIds = memberRows.filter((m) => m.contact_id).map((m) => m.contact_id);
    const [leadsRes, contactsRes] = await Promise.all([
      leadIds.length ? supabase.from("leads").select("id, legal_name, dba_name, contact_name, city, state").in("id", leadIds) : Promise.resolve({ data: [] }),
      contactIds.length ? supabase.from("contacts").select("id, first_name, last_name, phone, email, do_not_contact").in("id", contactIds) : Promise.resolve({ data: [] }),
    ]);
    const leadsById = Object.fromEntries((leadsRes.data ?? []).map((l) => [l.id, l]));
    const contactsById = Object.fromEntries((contactsRes.data ?? []).map((c) => [c.id, c]));

    setMembers(memberRows.map((m) => {
      if (m.lead_id) {
        const l = leadsById[m.lead_id];
        return { ...m, name: l?.legal_name || l?.dba_name || l?.contact_name || "Unnamed lead", subline: [l?.city, l?.state].filter(Boolean).join(", "), kind: "lead" };
      }
      const c = contactsById[m.contact_id];
      // do_not_contact withholds phone/email everywhere in this app, per
      // RECRUITING.md -- including here, a member row that would otherwise
      // display it directly.
      return { ...m, name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Unnamed contact", subline: c?.do_not_contact ? "Do not contact" : (c?.phone || c?.email || ""), kind: "contact" };
    }));
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    setCampaign(null);
    setFunnel(null);
    setMembers([]);
    load();
  }, [campaignId, load]);

  return { campaign, funnel, members, loading, error, reload: load };
}
