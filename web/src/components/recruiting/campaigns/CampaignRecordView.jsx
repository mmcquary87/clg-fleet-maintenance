import { useState } from "react";
import { ArrowLeft, Loader2, Play, Pause } from "lucide-react";
import { Badge, StatusPill, Button, Alert, Card } from "../../../ds";
import { useCampaignDetail } from "../../../hooks/useCampaignDetail";
import { supabase } from "../../../lib/supabaseClient";

const TYPE_LABELS = { lane: "Lane", area_code: "Area code", referral: "Referral", job_board: "Job board", event: "Event", other: "Other" };
const STATUS_TONES = { active: "brand", planned: "outline", paused: "neutral", completed: "neutral" };
const MEMBER_STATUS_TONES = { targeted: "neutral", contacted: "neutral", responded: "brand", converted: "brand", not_interested: "critical", removed: "critical" };

// Real funnel shape: 4 stacked trapezoids whose top edge = this stage's
// width and bottom edge = the next stage's width (so the shape narrows
// continuously, no gap between stages -- the color change at each seam
// IS the stage boundary). Width formula keeps small/zero stages visibly
// non-zero (14 + 86% of stage/targeted) rather than disappearing to a hairline.
const FUNNEL_STAGES = [
  { key: "members", label: "Targeted", color: "var(--clg-moon)", textColor: "var(--clg-navy)" },
  { key: "contacted", label: "Contacted", color: "var(--clg-mercury)", textColor: "var(--clg-navy)" },
  { key: "responded", label: "Responded", color: "var(--clg-royal)", textColor: "#fff" },
  { key: "converted", label: "Converted", color: "var(--clg-navy)", textColor: "#fff" },
];
const DROPOFF_VERB = { members: "were never contacted", contacted: "never responded", responded: "didn't convert" };

function widthPct(count, targeted) {
  return targeted > 0 ? 14 + 86 * (count / targeted) : 0;
}

function Funnel({ funnel }) {
  const targeted = funnel?.members || 0;
  if (targeted === 0) {
    return (
      <div style={{ border: "2px dashed var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)", padding: 30, textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
        No members yet
      </div>
    );
  }
  const widths = FUNNEL_STAGES.map((s) => widthPct(funnel[s.key] || 0, targeted));
  return (
    <div style={{ display: "flex", gap: 24 }}>
      <div style={{ flex: "0 0 260px" }}>
        {FUNNEL_STAGES.map((s, i) => {
          const topW = widths[i];
          const botW = i < FUNNEL_STAGES.length - 1 ? widths[i + 1] : widths[i];
          const clip = "polygon(" + (50 - topW / 2) + "% 0, " + (50 + topW / 2) + "% 0, " + (50 + botW / 2) + "% 100%, " + (50 - botW / 2) + "% 100%)";
          return (
            <div key={s.key} style={{ height: 52, background: s.color, clipPath: clip }} />
          );
        })}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {FUNNEL_STAGES.map((s, i) => {
          const count = funnel[s.key] || 0;
          const pctOfTargeted = Math.round((count / targeted) * 100);
          const next = i < FUNNEL_STAGES.length - 1 ? funnel[FUNNEL_STAGES[i + 1].key] || 0 : null;
          const dropCount = next !== null ? count - next : null;
          const dropPct = next !== null && count > 0 ? Math.round((dropCount / count) * 100) : null;
          return (
            <div key={s.key} style={{ height: 52, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)" }}>
                {s.label} — {count} <span style={{ fontWeight: 500, color: "var(--clg-text-muted)" }}>({pctOfTargeted}% of targeted)</span>
              </div>
              {dropCount !== null && dropCount > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
                  {dropCount} {DROPOFF_VERB[s.key]} · {dropPct}% of this stage
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function steepestDrop(funnel) {
  if (!funnel || !funnel.members) return null;
  let worst = null;
  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    const count = funnel[FUNNEL_STAGES[i].key] || 0;
    const next = funnel[FUNNEL_STAGES[i + 1].key] || 0;
    if (count === 0) continue;
    const pct = Math.round(((count - next) / count) * 100);
    if (!worst || pct > worst.pct) worst = { pct, from: FUNNEL_STAGES[i].label, to: FUNNEL_STAGES[i + 1].label };
  }
  return worst;
}

export default function CampaignRecordView({ campaignId, onBack, onGoToLeads }) {
  const { campaign, funnel, members, loading, error, reload } = useCampaignDetail(campaignId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const setStatus = async (status) => {
    setBusy(true);
    setActionError(null);
    const { error: err } = await supabase.from("campaigns").update({ status }).eq("id", campaignId);
    setBusy(false);
    if (err) setActionError(err.message); else reload();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-text-muted)" }}><Loader2 size={18} className="spin" /></div>;
  }
  if (error || !campaign) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-scarlet)" }}>{error || "Campaign not found."}</div>;
  }

  const drop = steepestDrop(funnel);
  const convertedPct = funnel?.members > 0 ? Math.round((funnel.converted / funnel.members) * 100) : 0;
  const targetingText = campaign.campaign_type === "lane"
    ? (campaign.lane_label || campaign.lane_origin_zip3 + " → " + campaign.lane_dest_zip3)
    : campaign.campaign_type === "area_code"
      ? (campaign.target_area_codes || []).join(", ")
      : campaign.description || "—";

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <button type="button" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", fontSize: 13, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Campaigns
      </button>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Badge tone="neutral">{TYPE_LABELS[campaign.campaign_type]}</Badge>
              <StatusPill tone={STATUS_TONES[campaign.status] || "neutral"}>{campaign.status}</StatusPill>
            </div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 20, color: "var(--clg-navy)" }}>{campaign.name}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {campaign.status === "planned" && <Button size="sm" iconLeft={<Play size={13} />} disabled={busy} onClick={() => setStatus("active")}>Launch</Button>}
            {campaign.status === "active" && <Button variant="outline" size="sm" iconLeft={<Pause size={13} />} disabled={busy} onClick={() => setStatus("paused")}>Pause</Button>}
            {campaign.status === "paused" && <Button size="sm" iconLeft={<Play size={13} />} disabled={busy} onClick={() => setStatus("active")}>Resume</Button>}
            {onGoToLeads && campaign.status !== "completed" && (
              <Button variant="outline" size="sm" onClick={onGoToLeads}>Add members from Leads</Button>
            )}
          </div>
        </div>
        {actionError && <Alert tone="critical" style={{ marginTop: 12 }}>{actionError}</Alert>}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 380px)", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <Card>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 16 }}>Funnel</div>
            <Funnel funnel={funnel} />
          </Card>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)" }}>Members</div>
              {funnel?.members > members.length && (
                <span style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>Showing {members.length} of {funnel.members}</span>
              )}
            </div>
            {members.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No members yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {members.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-body)" }}>{m.name}</div>
                      {m.subline && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{m.subline}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {m.tier && <Badge tone="neutral">Tier {m.tier}</Badge>}
                      <StatusPill tone={MEMBER_STATUS_TONES[m.status] || "neutral"}>{m.status.replace(/_/g, " ")}</StatusPill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 10 }}>Targeting</div>
            <div style={{ fontSize: 13, color: "var(--clg-text-body)" }}>{targetingText}</div>
          </Card>
          <Card>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 10 }}>Result</div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)" }}>{convertedPct}%</div>
            <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 2 }}>conversion rate</div>
            {drop && (
              <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginTop: 10 }}>
                Steepest drop: {drop.pct}% between {drop.from} and {drop.to}.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
