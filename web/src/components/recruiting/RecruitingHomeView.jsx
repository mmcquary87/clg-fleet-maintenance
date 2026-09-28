import { useState } from "react";
import { AlertTriangle, ClipboardList, CalendarClock } from "lucide-react";
import { Card, Eyebrow } from "../../ds";
import { useRecruitingHome } from "../../hooks/useRecruitingHome";
import LeadDetailModal from "./LeadDetailModal";
import OnboardingCaseModal from "../onboarding/OnboardingCaseModal";

const SEGMENT_LABELS = { new_mc: "New MC", small_fleet: "Small fleet", driver: "Driver" };
const SEGMENT_ORDER = ["new_mc", "small_fleet", "driver"];

// A light-to-dark sequential ramp (the app's own existing gray-to-navy
// scale, tokens.css) for the "by status" bar -- these 6 buckets are an
// ORDERED progression through the pipeline, not unordered categories, so a
// single-hue sequential scale reads correctly where distinct categorical
// hues would wrongly imply the stages aren't related.
const STATUS_BUCKETS = [
  { key: "new", label: "New", color: "var(--clg-reflection)", textColor: "var(--clg-granite)" },
  { key: "enriched", label: "Enriched", color: "var(--clg-moon)", textColor: "var(--clg-granite)" },
  { key: "qualified", label: "Qualified", color: "var(--clg-mercury)", textColor: "var(--clg-navy)" },
  { key: "contacted", label: "Contacted", color: "var(--clg-cool)", textColor: "#fff" },
  { key: "in_conversation", label: "In conversation", color: "var(--clg-royal)", textColor: "#fff" },
  { key: "converted", label: "Converted", color: "var(--clg-navy)", textColor: "#fff" },
];
const BUCKET_STATUSES = {
  new: ["new"], enriched: ["enriched"], qualified: ["qualified"], contacted: ["contacted"],
  in_conversation: ["in_conversation"], converted: ["onboarding", "signed"],
};

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}

function SegmentTile({ segment, stats, onClick }) {
  return (
    <Card interactive onClick={onClick} style={{ cursor: "pointer" }}>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>
        {SEGMENT_LABELS[segment]}
      </div>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 30, color: "var(--clg-navy)", marginTop: 6 }}>
        {stats.active}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
        {stats.openFlags > 0 ? stats.openFlags + " flagged" : "None flagged"} · {stats.addedThisWeek} added this week
      </div>
    </Card>
  );
}

function StatusBar({ statusCounts, onGoToStatuses }) {
  const total = STATUS_BUCKETS.reduce((s, b) => s + (statusCounts[b.key] || 0), 0);
  if (total === 0) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No active leads yet.</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 2, borderRadius: "var(--clg-radius-sm)", overflow: "hidden", height: 28 }}>
        {STATUS_BUCKETS.filter((b) => statusCounts[b.key] > 0).map((b) => (
          <div
            key={b.key} title={b.label + ": " + statusCounts[b.key]}
            onClick={() => onGoToStatuses(BUCKET_STATUSES[b.key])}
            style={{ flex: statusCounts[b.key], background: b.color, cursor: "pointer", minWidth: 4 }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
        {STATUS_BUCKETS.map((b) => (
          <button
            key={b.key} type="button" onClick={() => onGoToStatuses(BUCKET_STATUSES[b.key])}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12.5, color: "var(--clg-text-body)" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, background: b.color, flexShrink: 0 }} />
            {b.label} ({statusCounts[b.key] || 0})
          </button>
        ))}
      </div>
    </div>
  );
}

function AttentionCard({ icon: Icon, title, rule, emptyText, viewAllLabel, onViewAll, children }) {
  return (
    <Card rule={rule}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon size={15} color="var(--clg-navy)" />
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)" }}>{title}</div>
      </div>
      {children.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>{emptyText}</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
          {onViewAll && (
            <button type="button" onClick={onViewAll} style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", fontSize: 12, padding: 0 }}>
              {viewAllLabel}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

export default function RecruitingHomeView({ onGoToLeads, onGoToOnboarding }) {
  const { loading, error, activeCount, segmentStats, statusCounts, flaggedLeads, flaggedActiveCount, overdueCases, soonCases, activity, reload } = useRecruitingHome();
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-text-muted)" }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--clg-scarlet)" }}>{error}</div>;
  }

  const ledeParts = [];
  if (flaggedActiveCount > 0) ledeParts.push(flaggedActiveCount + " lead" + (flaggedActiveCount === 1 ? "" : "s") + " need" + (flaggedActiveCount === 1 ? "s" : "") + " a look");
  if (overdueCases.length > 0) ledeParts.push(overdueCases.length + " onboarding case" + (overdueCases.length === 1 ? "" : "s") + " overdue");
  if (soonCases.length > 0) ledeParts.push(soonCases.length + " case" + (soonCases.length === 1 ? "" : "s") + " starting within 2 weeks");
  const lede = ledeParts.length > 0 ? ledeParts.join(", ") + "." : "Nothing needs attention right now.";

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Eyebrow tone="brand">Recruiting</Eyebrow>
        <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
          {activeCount} lead{activeCount === 1 ? "" : "s"} in the pipeline
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6 }}>{lede}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        {SEGMENT_ORDER.map((seg) => (
          <SegmentTile key={seg} segment={seg} stats={segmentStats[seg]} onClick={() => onGoToLeads({ segment: seg })} />
        ))}
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 14 }}>By status</div>
        <StatusBar statusCounts={statusCounts} onGoToStatuses={(statuses) => onGoToLeads({ statuses })} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 20 }}>
        <AttentionCard
          icon={AlertTriangle} title="Leads to review" rule={flaggedActiveCount > 0}
          emptyText="No leads flagged for review." viewAllLabel={"View all " + flaggedActiveCount}
          onViewAll={flaggedActiveCount > 0 ? () => onGoToLeads({ flagsOnly: true }) : undefined}
        >
          {flaggedLeads.slice(0, 5).map((l) => (
            <button key={l.id} type="button" onClick={() => setSelectedLeadId(l.id)} style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--clg-text-body)", padding: 0 }}>
              {l.legal_name || l.dba_name || l.contact_name || "Unnamed lead"}
            </button>
          ))}
        </AttentionCard>

        <AttentionCard
          icon={ClipboardList} title="Overdue onboarding steps"
          emptyText="No overdue steps." viewAllLabel={"View all " + overdueCases.length}
          onViewAll={overdueCases.length > 0 ? () => onGoToOnboarding({ overdueOnly: true }) : undefined}
        >
          {overdueCases.slice(0, 5).map((c) => (
            <button key={c.id} type="button" onClick={() => setSelectedCaseId(c.id)} style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--clg-text-body)", padding: 0 }}>
              {c.recruit || c.account || "Unnamed"} — {c.overdue_steps} overdue
            </button>
          ))}
        </AttentionCard>

        <AttentionCard
          icon={CalendarClock} title="Starting within 14 days"
          emptyText="No cases starting soon." viewAllLabel={"View all " + soonCases.length}
          onViewAll={soonCases.length > 0 ? () => onGoToOnboarding({ startingSoon: true }) : undefined}
        >
          {soonCases.slice(0, 5).map((c) => (
            <button key={c.id} type="button" onClick={() => setSelectedCaseId(c.id)} style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--clg-text-body)", padding: 0 }}>
              {c.recruit || c.account || "Unnamed"} — {fmtDate(c.target_start)}
            </button>
          ))}
        </AttentionCard>
      </div>

      <Card>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-navy)", marginBottom: 14 }}>Recent activity</div>
        {activity.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>No activity logged yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activity.map((a, i) => (
              <button
                key={i} type="button" onClick={() => setSelectedLeadId(a.leadId)}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{
                  width: 8, height: 8, marginTop: 4, flexShrink: 0, background: "var(--clg-royal)",
                  borderRadius: a.kind === "conversation" ? "50%" : 2,
                }} />
                <span style={{ fontSize: 13, color: "var(--clg-text-body)" }}>
                  {a.text}
                  <span style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginLeft: 6 }}>{fmtDate(a.at)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedLeadId && (
        <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onLeadChanged={reload} />
      )}
      {selectedCaseId && (
        <OnboardingCaseModal caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} onCaseChanged={reload} />
      )}
    </div>
  );
}
