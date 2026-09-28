import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Badge, StatusPill, Select, Alert, Eyebrow, Button } from "../../ds";
import { useOnboardingCases } from "../../hooks/useOnboardingCases";
import NewCaseForm from "./NewCaseForm";
import OnboardingCaseModal from "./OnboardingCaseModal";

const PATHWAY_LABELS = { company_driver: "Company driver", lease_on: "Lease-on", brokerage_carrier: "Brokerage carrier" };
const CASE_STATUS_TONES = { cleared: "green", withdrawn: "red", rejected: "red", on_hold: "neutral", open: "brand" };
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On hold" },
  { value: "cleared", label: "Cleared" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "rejected", label: "Rejected" },
];
const PATHWAY_OPTIONS = [
  { value: "", label: "All pathways" },
  { value: "company_driver", label: "Company driver" },
  { value: "lease_on", label: "Lease-on" },
  { value: "brokerage_carrier", label: "Brokerage carrier" },
];

// initialFilter (from Recruiting Home's quick links): { overdueOnly?,
// startingSoon? }.
export default function OnboardingView({ initialFilter }) {
  const { cases, loading, error, reload } = useOnboardingCases();
  const [statusFilter, setStatusFilter] = useState("open");
  const [pathwayFilter, setPathwayFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(!!initialFilter?.overdueOnly);
  const [startingSoon, setStartingSoon] = useState(!!initialFilter?.startingSoon);
  const [showNewCase, setShowNewCase] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const soonCutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (pathwayFilter && c.pathway !== pathwayFilter) return false;
      if (overdueOnly && !((c.overdue_steps ?? 0) > 0)) return false;
      if (startingSoon && !(c.target_start && c.target_start >= today && c.target_start <= soonCutoff)) return false;
      return true;
    });
  }, [cases, statusFilter, pathwayFilter, overdueOnly, startingSoon, today, soonCutoff]);

  const columns = [
    { key: "recruit", label: "Recruit / account" },
    { key: "pathway", label: "Pathway" },
    { key: "status", label: "Status" },
    { key: "stage", label: "Stage" },
    { key: "steps", label: "Steps" },
    { key: "template", label: "Template" },
  ];

  const rows = filtered.map((c) => ({
    id: c.id,
    recruit: <span style={{ fontWeight: 600, color: "var(--clg-navy)" }}>{c.recruit || c.account || "Unnamed"}</span>,
    pathway: <Badge tone="neutral">{PATHWAY_LABELS[c.pathway] || c.pathway}</Badge>,
    status: <StatusPill tone={CASE_STATUS_TONES[c.status] || "neutral"}>{c.status.replace(/_/g, " ")}</StatusPill>,
    stage: c.current_stage || "—",
    steps: (
      <span>
        {c.required_done}/{c.required_steps}
        {c.overdue_steps > 0 && <StatusPill tone="red" style={{ marginLeft: 6 }}>{c.overdue_steps} overdue</StatusPill>}
      </span>
    ),
    template: c.template_status === "approved" ? <StatusPill tone="green">approved</StatusPill> : <StatusPill tone="pending">{c.template_status}</StatusPill>,
    _onClick: () => setSelectedCaseId(c.id),
  }));

  return (
    <div style={{ padding: 28, fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Recruiting</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {filtered.length} onboarding case{filtered.length === 1 ? "" : "s"}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 160 }}>
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          </div>
          <div style={{ width: 190 }}>
            <Select options={PATHWAY_OPTIONS} value={pathwayFilter} onChange={(e) => setPathwayFilter(e.target.value)} />
          </div>
          {[
            { active: overdueOnly, onClick: () => setOverdueOnly((v) => !v), label: "Overdue step" },
            { active: startingSoon, onClick: () => setStartingSoon((v) => !v), label: "Starting within 14 days" },
          ].map((chip) => (
            <button
              key={chip.label} type="button" onClick={chip.onClick}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: "var(--clg-radius-pill)",
                border: "1px solid " + (chip.active ? "var(--clg-royal)" : "var(--clg-border-default)"),
                background: chip.active ? "var(--clg-royal)" : "transparent", color: chip.active ? "#fff" : "var(--clg-text-body)",
                fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {chip.label}
            </button>
          ))}
          <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setShowNewCase(true)}>New case</Button>
        </div>
      </div>

      {showNewCase && (
        <NewCaseForm onCancel={() => setShowNewCase(false)} onSaved={() => { setShowNewCase(false); reload(); }} />
      )}

      {error && <Alert tone="critical" title="Couldn't load onboarding cases" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading onboarding cases…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No onboarding cases match these filters.
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
                <tr key={r.id} onClick={r._onClick} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}>
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

      {selectedCaseId && (
        <OnboardingCaseModal caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} onCaseChanged={reload} />
      )}
    </div>
  );
}
