import { useMemo, useState } from "react";
import { Loader2, Plus, Megaphone } from "lucide-react";
import { Badge, StatusPill, Select, Alert, Eyebrow, Button, Card } from "../../../ds";
import { useCampaigns } from "../../../hooks/useCampaigns";
import NewCampaignForm from "./NewCampaignForm";
import MiniFunnel from "./MiniFunnel";

const TYPE_LABELS = { lane: "Lane", area_code: "Area code", referral: "Referral", job_board: "Job board", event: "Event", other: "Other" };
const STATUS_TONES = { active: "brand", planned: "outline", paused: "neutral", completed: "neutral" };
const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "lane", label: "Lane" },
  { value: "area_code", label: "Area code" },
  { value: "referral", label: "Referral" },
  { value: "job_board", label: "Job board" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

const TYPE_DESCRIPTIONS = [
  ["Lane", "target carriers/drivers running a specific origin → destination lane"],
  ["Area code", "target a set of phone area codes"],
  ["Referral", "track a referral push from current drivers/owner-operators"],
  ["Job board", "track a specific job board posting"],
  ["Event", "a job fair, an orientation session, any one-time event"],
];

function EmptyState({ onNew, onGoToLeads }) {
  return (
    <Card style={{ padding: "40px 32px", textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
      <Megaphone size={28} color="var(--clg-royal)" style={{ marginBottom: 12 }} />
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: "var(--clg-size-h5)", color: "var(--clg-navy)", marginBottom: 8 }}>
        No campaigns yet
      </div>
      <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
        A campaign is a tracked outreach push — a lane, an area code, a referral drive, a job board post, or an
        event — with a funnel showing how many leads moved from targeted through contacted, responded, and converted.
      </p>
      <ul style={{ textAlign: "left", fontSize: 13, color: "var(--clg-text-body)", lineHeight: 1.8, maxWidth: 420, margin: "0 auto 20px", paddingLeft: 20 }}>
        {TYPE_DESCRIPTIONS.map(([type, desc]) => (
          <li key={type}><strong>{type}</strong> — {desc}</li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
        <Button size="sm" iconLeft={<Plus size={14} />} onClick={onNew}>New campaign</Button>
        {onGoToLeads && <Button variant="outline" size="sm" onClick={onGoToLeads}>Start from Leads</Button>}
      </div>
      <p style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
        Or select leads on the Leads view first, then use "Add to a campaign" from there.
      </p>
    </Card>
  );
}

export default function CampaignsView({ onOpenCampaign, onGoToLeads }) {
  const { campaigns, loading, error, reload } = useCampaigns();
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (typeFilter && c.campaign_type !== typeFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [campaigns, typeFilter, statusFilter]);

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Recruiting</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
          </h2>
        </div>
        {campaigns.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 160 }}>
              <Select options={TYPE_OPTIONS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
            </div>
            <div style={{ width: 160 }}>
              <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
            </div>
            <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setShowNewCampaign(true)}>New campaign</Button>
          </div>
        )}
      </div>

      {showNewCampaign && (
        <NewCampaignForm onCancel={() => setShowNewCampaign(false)} onSaved={() => { setShowNewCampaign(false); reload(); }} />
      )}

      {error && <Alert tone="critical" title="Couldn't load campaigns" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        !showNewCampaign && <EmptyState onNew={() => setShowNewCampaign(true)} onGoToLeads={onGoToLeads} />
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No campaigns match these filters.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
            <thead>
              <tr>
                {["Campaign / targeting", "Type", "Status", "Owner", "Funnel", "Converted"].map((label) => (
                  <th key={label} style={{
                    textAlign: "left", padding: "10px 12px", fontFamily: "var(--clg-font-heading)",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                  }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const targeting = c.campaign_type === "lane"
                  ? (c.lane_label || (c.lane_origin_zip3 + " → " + c.lane_dest_zip3))
                  : c.campaign_type === "area_code"
                    ? (c.target_area_codes || []).join(", ")
                    : c.description || "—";
                const convertedPct = c.members > 0 ? Math.round((c.converted / c.members) * 100) : 0;
                return (
                  <tr key={c.id} onClick={() => onOpenCampaign(c.id)} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      <div style={{ fontWeight: 600, color: "var(--clg-navy)" }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{targeting}</div>
                    </td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}><Badge tone="neutral">{TYPE_LABELS[c.campaign_type]}</Badge></td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}><StatusPill tone={STATUS_TONES[c.status] || "neutral"}>{c.status}</StatusPill></td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-muted)" }}>{c.ownerName || "—"}</td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)" }}><MiniFunnel counts={c} /></td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", fontWeight: 600, color: "var(--clg-navy)" }}>{convertedPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
