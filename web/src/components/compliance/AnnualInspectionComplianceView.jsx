import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card, Toggle, Alert } from "../../ds";
import { useAnnualInspectionCompliance } from "../../hooks/useAnnualInspectionCompliance";
import EmptyState from "../EmptyState";

const BAND_COLOR = { red: "var(--clg-scarlet)", yellow: "#E8C13D", green: "#2E9E5B" };
const BAND_LABEL = { red: "Red", yellow: "Yellow", green: "Green" };
const TYPE_LABEL = { Truck: "Tractor", Trailer: "Trailer" };
const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "Truck", label: "Tractors" },
  { value: "Trailer", label: "Trailers" },
];

function fmtDate(d) {
  if (!d) return "No inspection on file";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDays(n) {
  if (n == null) return "—";
  if (n < 0) return `${Math.abs(n)}d overdue`;
  if (n === 0) return "Due today";
  return `${n}d`;
}

// This is a decision-support console, not a governed KPI (per the design
// brief) -- pill/chip visual language deliberately mirrors
// OperationsView.jsx's HeadlineTile so it reads as part of the same
// system rather than a bolt-on, even though it's a plainer table page
// underneath (built ahead of the actual Claude Design visual pass).
function CountChip({ band, count }) {
  return (
    <Card padding={14} style={{ borderTop: `3px solid ${BAND_COLOR[band]}`, minWidth: 120 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--clg-text-muted)", textTransform: "uppercase" }}>
        {BAND_LABEL[band]}
      </div>
      <div style={{ marginTop: 4, fontFamily: "var(--clg-font-heading)", fontSize: 24, fontWeight: 700, color: "var(--clg-navy)" }}>
        {count}
      </div>
    </Card>
  );
}

function NotesCell({ row, onSave }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(row.annual_inspection_notes || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(row.id, draft.trim() || null);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
          fontSize: 12.5, color: row.annual_inspection_notes ? "var(--clg-text-body)" : "var(--clg-text-muted)",
          textAlign: "left", padding: 0, maxWidth: 240,
        }}
      >
        {expanded ? <ChevronDown size={13} style={{ flexShrink: 0 }} /> : <ChevronRight size={13} style={{ flexShrink: 0 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.annual_inspection_notes || "Add a note"}
        </span>
      </button>
      {expanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Location, driver, follow-up flag…"
            rows={2}
            style={{
              fontSize: 12.5, fontFamily: "var(--clg-font-body)", padding: "8px 10px",
              border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)", resize: "vertical",
            }}
          />
          <button
            onClick={save}
            disabled={saving}
            style={{
              alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, color: "var(--clg-royal)",
              background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {saving && <Loader2 size={12} className="spin" />} Save note
          </button>
        </div>
      )}
    </>
  );
}

// Standalone Annual Inspection Compliance console -- gives dispatch/safety
// one screen of which tractors/trailers are coming due or overdue for
// their DOT annual inspection. Built ahead of the incoming Claude Design
// visual pass (per the design brief, 2026-09-18) -- data layer, sorting,
// filtering, and the notes edit interaction are real and wired to
// Supabase now; the plain table/chip styling here is a placeholder for
// that design to land on top of.
export default function AnnualInspectionComplianceView() {
  const { rows, loading, error, saveNotes } = useAnnualInspectionCompliance();
  const [typeFilter, setTypeFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => typeFilter === "all" || r.type === typeFilter)
      .filter((r) => showInactive || r.alvysStatus === "Active")
      .sort((a, b) => {
        const bandOrder = { red: 0, yellow: 1, green: 2 };
        if (bandOrder[a.band] !== bandOrder[b.band]) return bandOrder[a.band] - bandOrder[b.band];
        const aExp = a.expiration ?? "0000-00-00";
        const bExp = b.expiration ?? "0000-00-00";
        return aExp < bExp ? -1 : aExp > bExp ? 1 : 0;
      });
  }, [rows, typeFilter, showInactive]);

  const counts = useMemo(() => {
    const visible = rows.filter((r) => typeFilter === "all" || r.type === typeFilter).filter((r) => showInactive || r.alvysStatus === "Active");
    return {
      red: visible.filter((r) => r.band === "red").length,
      yellow: visible.filter((r) => r.band === "yellow").length,
      green: visible.filter((r) => r.band === "green").length,
    };
  }, [rows, typeFilter, showInactive]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 80px" }}>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)", marginBottom: 4 }}>
        Annual Inspection Compliance
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 20 }}>
        Which tractors and trailers are coming due — or already overdue — for their DOT annual inspection.
      </div>

      {error && <Alert tone="critical" title="Couldn't load units" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <CountChip band="red" count={counts.red} />
        <CountChip band="yellow" count={counts.yellow} />
        <CountChip band="green" count={counts.green} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              style={{
                fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: "var(--clg-radius-pill)", cursor: "pointer",
                border: "1px solid " + (typeFilter === f.value ? "var(--clg-navy)" : "var(--clg-border-default)"),
                background: typeFilter === f.value ? "var(--clg-navy)" : "transparent",
                color: typeFilter === f.value ? "#fff" : "var(--clg-text-muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive units" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--clg-text-muted)" }}>
          <Loader2 size={18} className="spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No units match" body="Try a different type filter, or show inactive units." />
      ) : (
        <Card padding={0} style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--clg-surface-subtle)", textAlign: "left" }}>
                {["Unit #", "Type", "Status", "Expiration", "Days until due", "Notes"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid var(--clg-border-subtle)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--clg-navy)" }}>{row.number}</td>
                  <td style={{ padding: "10px 14px", color: "var(--clg-text-body)" }}>{TYPE_LABEL[row.type] || row.type}</td>
                  <td style={{ padding: "10px 14px", color: row.alvysStatus === "Active" ? "var(--clg-text-body)" : "var(--clg-text-muted)" }}>{row.alvysStatus}</td>
                  <td style={{ padding: "10px 14px", color: "var(--clg-text-body)" }}>{fmtDate(row.expiration)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: BAND_COLOR[row.band] }}>{fmtDays(row.daysUntilDue)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <NotesCell row={row} onSave={saveNotes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
