import { useMemo, useState } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { Badge, StatusPill, Select, Alert, Eyebrow, Button } from "../../ds";
import { useRecruitingLeads } from "../../hooks/useRecruitingLeads";
import LeadDetailModal from "./LeadDetailModal";
import NewLeadForm from "./NewLeadForm";
import TenstreetImportForm from "./TenstreetImportForm";

const SEGMENT_LABELS = { new_mc: "New MC", small_fleet: "Small fleet", driver: "Driver" };
const SEGMENT_TONES = { new_mc: "brand", small_fleet: "neutral", driver: "accent" };
const STATUS_TONES = {
  signed: "green", onboarding: "green",
  disqualified: "red", lost: "red", do_not_contact: "red",
};
const CLOSED_STATUSES = ["disqualified", "lost", "do_not_contact", "signed"];

const SEGMENT_OPTIONS = [
  { value: "", label: "All segments" },
  { value: "new_mc", label: "New MC" },
  { value: "small_fleet", label: "Small fleet" },
  { value: "driver", label: "Driver" },
];
const PIPELINE_OPTIONS = [
  { value: "active", label: "Active pipeline" },
  { value: "all", label: "All leads (incl. closed)" },
];

function ScoreCell({ lead }) {
  if (lead.disqualified_reason) return <Badge tone="critical">Disqualified</Badge>;
  if (lead.score_status === "pending" || lead.fit_score == null) return <StatusPill tone="pending">Pending</StatusPill>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{lead.fit_score}</span>
      {lead.score_status === "provisional" && <StatusPill tone="pending">Provisional</StatusPill>}
    </span>
  );
}

// initialFilter (from Recruiting Home's quick links): { segment?, statuses?
// (an explicit list of raw lead_status values, e.g. ["onboarding","signed"]
// for the "converted" status bucket), flagsOnly? }.
export default function RecruitingView({ initialFilter }) {
  const { leads, loading, error, reload } = useRecruitingLeads();
  const [segmentFilter, setSegmentFilter] = useState(initialFilter?.segment ?? "");
  const [pipelineFilter, setPipelineFilter] = useState("active");
  const [flagsOnly, setFlagsOnly] = useState(!!initialFilter?.flagsOnly);
  const [statusesFilter] = useState(initialFilter?.statuses ?? null);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showTenstreetImport, setShowTenstreetImport] = useState(false);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (segmentFilter && l.segment !== segmentFilter) return false;
      if (statusesFilter && !statusesFilter.includes(l.status)) return false;
      if (!statusesFilter && pipelineFilter === "active" && CLOSED_STATUSES.includes(l.status)) return false;
      if (flagsOnly && !(l.openReviewFlags > 0)) return false;
      return true;
    });
  }, [leads, segmentFilter, pipelineFilter, statusesFilter, flagsOnly]);

  const flaggedCount = filtered.filter((l) => l.openReviewFlags > 0).length;

  const rows = filtered.map((l) => ({
    id: l.id,
    name: (
      <div>
        <div style={{ fontWeight: 600, color: "var(--clg-navy)" }}>{l.legal_name || l.dba_name || "Unnamed lead"}</div>
        <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
          {[l.dot_number ? `DOT ${l.dot_number}` : null, l.mc_number ? `MC ${l.mc_number}` : null].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>
    ),
    segment: <Badge tone={SEGMENT_TONES[l.segment] || "neutral"}>{SEGMENT_LABELS[l.segment] || l.segment}</Badge>,
    status: <StatusPill tone={STATUS_TONES[l.status] || "neutral"}>{l.status.replace(/_/g, " ")}</StatusPill>,
    score: <ScoreCell lead={l} />,
    flags: l.openReviewFlags > 0 ? <StatusPill tone="yellow">{l.openReviewFlags} open</StatusPill> : <span style={{ color: "var(--clg-text-muted)" }}>—</span>,
    location: [l.city, l.state].filter(Boolean).join(", ") || "—",
    source: <span style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>{l.sourceLabel}</span>,
    _onClick: () => setSelectedLeadId(l.id),
  }));

  const columns = [
    { key: "name", label: "Lead" },
    { key: "segment", label: "Segment" },
    { key: "status", label: "Status" },
    { key: "score", label: "Fit score" },
    { key: "flags", label: "Flags" },
    { key: "location", label: "Location" },
    { key: "source", label: "Source" },
  ];

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Recruiting</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {filtered.length} lead{filtered.length === 1 ? "" : "s"}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
            {flaggedCount > 0 ? `${flaggedCount} with an open review flag.` : "None flagged for review."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 170 }}>
            <Select options={SEGMENT_OPTIONS} value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} />
          </div>
          <div style={{ width: 190 }}>
            <Select options={PIPELINE_OPTIONS} value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value)} />
          </div>
          <button
            type="button" onClick={() => setFlagsOnly((v) => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: "var(--clg-radius-pill)",
              border: "1px solid " + (flagsOnly ? "var(--clg-royal)" : "var(--clg-border-default)"),
              background: flagsOnly ? "var(--clg-royal)" : "transparent", color: flagsOnly ? "#fff" : "var(--clg-text-body)",
              fontSize: 12.5, cursor: "pointer",
            }}
          >
            Open flags only
          </button>
          <Button variant="outline" size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowTenstreetImport(true)}>Import Tenstreet CSV</Button>
          <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setShowNewLead(true)}>New lead</Button>
        </div>
      </div>

      {showNewLead && (
        <NewLeadForm onCancel={() => setShowNewLead(false)} onSaved={() => { setShowNewLead(false); reload(); }} />
      )}

      {showTenstreetImport && (
        <TenstreetImportForm onCancel={() => setShowTenstreetImport(false)} onImported={reload} />
      )}

      {error && <Alert tone="critical" title="Couldn't load leads" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading leads…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No leads match these filters.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{
                    textAlign: "left", padding: "10px 12px", fontFamily: "var(--clg-font-heading)",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                  }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id} onClick={r._onClick}
                  style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ padding: "11px 12px", borderBottom: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-body)" }}>
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLeadId && (
        <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onLeadChanged={reload} />
      )}
    </div>
  );
}
