import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button, Select, Alert } from "../../../ds";
import { supabase } from "../../../lib/supabaseClient";

const TIER_OPTIONS = [
  { value: "", label: "No tier" },
  { value: "1", label: "Tier 1" },
  { value: "2", label: "Tier 2" },
  { value: "3", label: "Tier 3" },
  { value: "4", label: "Tier 4" },
];

export default function AddToCampaignModal({ leadIds, onClose, onAdded, onGoToCampaigns }) {
  const [campaigns, setCampaigns] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tier, setTier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from("campaigns").select("id, name, campaign_type, status").in("status", ["active", "planned"]).order("name")
      .then(({ data }) => setCampaigns(data ?? []));
  }, []);

  const onSubmit = async () => {
    if (!selectedId) { setError("Pick a campaign."); return; }
    setSubmitting(true);
    setError(null);

    const { data: existing } = await supabase.from("campaign_members").select("lead_id").eq("campaign_id", selectedId).in("lead_id", leadIds);
    const existingIds = new Set((existing ?? []).map((m) => m.lead_id));
    const newLeadIds = leadIds.filter((id) => !existingIds.has(id));

    if (newLeadIds.length === 0) {
      setSubmitting(false);
      setError("Every selected lead is already in this campaign.");
      return;
    }

    const { error: err } = await supabase.from("campaign_members").insert(
      newLeadIds.map((leadId) => ({ campaign_id: selectedId, lead_id: leadId, tier: tier ? Number(tier) : null })),
    );
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    onAdded(selectedId, newLeadIds.length);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, .5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 460, boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>Add {leadIds.length} lead{leadIds.length === 1 ? "" : "s"} to a campaign</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
        </div>

        {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}

        {campaigns === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={16} className="spin" /></div>
        ) : campaigns.length === 0 ? (
          <div>
            <p style={{ fontSize: 13, color: "var(--clg-text-muted)", marginBottom: 14 }}>No active or planned campaigns yet.</p>
            {onGoToCampaigns && <Button size="sm" onClick={onGoToCampaigns}>New campaign</Button>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: 240, overflowY: "auto" }}>
              {campaigns.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" name="campaign" checked={selectedId === c.id} onChange={() => setSelectedId(c.id)} />
                  {c.name}
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--clg-text-muted)" }}>{c.status}</span>
                </label>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <Select value={tier} onChange={(e) => setTier(e.target.value)} options={TIER_OPTIONS} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button size="sm" onClick={onSubmit} disabled={submitting || !selectedId}>
                {submitting && <Loader2 size={14} className="spin" />}
                Add {leadIds.length} lead{leadIds.length === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
