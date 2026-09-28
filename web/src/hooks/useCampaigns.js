import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Campaigns list -- the campaigns table's own targeting/status fields
// merged with the campaign_funnel view's counts (members/contacted/
// responded/converted, each cumulative -- "responded" already includes
// "converted", etc., see campaign_funnel's own definition).
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [campaignsRes, funnelRes, profilesRes] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("campaign_funnel").select("*"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (campaignsRes.error) {
      setError(campaignsRes.error.message);
      setCampaigns([]);
      setLoading(false);
      return;
    }
    const funnelById = Object.fromEntries((funnelRes.data ?? []).map((f) => [f.id, f]));
    const nameById = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));
    setCampaigns((campaignsRes.data ?? []).map((c) => ({
      ...c,
      ownerName: nameById[c.owner_id] || null,
      members: funnelById[c.id]?.members ?? 0,
      contacted: funnelById[c.id]?.contacted ?? 0,
      responded: funnelById[c.id]?.responded ?? 0,
      converted: funnelById[c.id]?.converted ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { campaigns, loading, error, reload: load };
}
