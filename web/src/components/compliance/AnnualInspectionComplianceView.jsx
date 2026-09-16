import { Fragment, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, Badge, Button, Toggle, Alert, Eyebrow } from "../../ds";
import { useAnnualInspectionCompliance } from "../../hooks/useAnnualInspectionCompliance";
import { downloadCsv } from "../../lib/exportCsv";
import EmptyState from "../EmptyState";

// Band colors are a palette ramp, not a traffic light (Claude Design
// handoff, 2026-09-18): the brand has no warning/amber token, and an
// earlier pass's hardcoded amber failed contrast at 14px bold. Urgency
// decreases along the existing blue-grey ramp instead -- Ruby (red),
// Royal (yellow), Pewter (green) -- all already-defined tokens, not new colors.
const BAND_COLOR = { red: "var(--clg-ruby)", yellow: "var(--clg-royal)", green: "var(--clg-pewter)" };
const BAND_LABEL = { red: "overdue or due inside 14 days", yellow: "due in 14 to 29 days", green: "due in 30 days or more" };
const TYPE_LABEL = { Truck: "Tractor", Trailer: "Trailer" };
const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "Truck", label: "Tractors" },
  { value: "Trailer", label: "Trailers" },
];

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDays(row) {
  if (row.overdue) return `${Math.abs(row.daysUntilDue)}d late`;
  return `${row.daysUntilDue}d`;
}

// Templated per the handoff's four exact copy variants (overdue / red /
// yellow / green) -- states the consequence next to the fact rather than
// just repeating the date, per the handoff's own copy guidance.
function consequenceFor(row) {
  const typeWord = row.type === "Trailer" ? "trailer" : "tractor";
  const inService = row.alvysStatus === "Active";
  if (row.overdue) {
    const days = Math.abs(row.daysUntilDue);
    if (inService) {
      return `Expired ${days} day${days === 1 ? "" : "s"} ago and still marked Active in Alvys, so nothing stops this ${typeWord} being dispatched today. An inspection-level violation here is the driver's CSA score as well as the load.`;
    }
    return `Expired ${days} day${days === 1 ? "" : "s"} ago. Marked ${row.alvysStatus} in Alvys, so it isn't being dispatched today — but it must clear inspection before it can return to service.`;
  }
  if (row.band === "red") {
    return `Due in ${row.daysUntilDue} day${row.daysUntilDue === 1 ? "" : "s"}. Book it now: a shop slot inside two weeks is not guaranteed, and the date does not move.`;
  }
  if (row.band === "yellow") {
    return `Due in ${row.daysUntilDue} days. Comfortable, provided it is scheduled rather than remembered.`;
  }
  return `Due in ${row.daysUntilDue} days. Nothing to do yet; it appears here so the month ahead is visible.`;
}

function ledeFor(expiredCount) {
  if (expiredCount === 0) return "Every tractor and trailer with a DOT annual inspection on file, soonest first. No in-service units are currently expired.";
  if (expiredCount === 1) return "Every tractor and trailer with a DOT annual inspection on file, soonest first. 1 in-service unit is already expired.";
  return `Every tractor and trailer with a DOT annual inspection on file, soonest first. ${expiredCount} in-service units are already expired.`;
}

function CountChip({ band, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, background: active ? "var(--clg-surface-subtle)" : "transparent",
        border: "1px solid " + (active ? BAND_COLOR[band] : "var(--clg-border-subtle)"),
        borderRadius: "var(--clg-radius-pill)", padding: "8px 16px", cursor: "pointer",
        boxShadow: active ? `inset 0 0 0 2px ${BAND_COLOR[band]}` : "none",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: BAND_COLOR[band], flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 16, color: BAND_COLOR[band] }}>{count}</span>
      <span style={{ fontSize: 12.5, color: "var(--clg-text-body)" }}>{BAND_LABEL[band]}</span>
    </button>
  );
}

function ExpandedRow({ row, onSave, onGoToWorkOrders, onGoToUnits }) {
  const [draft, setDraft] = useState(row.annual_inspection_notes || "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(row.id, draft.trim() || null);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td colSpan={6} style={{ padding: 0, background: "var(--clg-surface-subtle)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: "18px 14px" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 8 }}>
              What this means
            </div>
            <div style={{ fontSize: 13, color: "var(--clg-text-body)", lineHeight: 1.5, marginBottom: 14 }}>
              {consequenceFor(row)}
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Button size="sm" onClick={() => onGoToWorkOrders?.("DOT Inspection")}>Raise a work order</Button>
              <button
                onClick={() => onGoToUnits?.()}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", fontSize: 12.5, fontWeight: 700 }}
              >
                Open the unit
              </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 8 }}>
              Notes <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: "normal", color: "var(--clg-text-muted)" }}>· kept here, not in Alvys</span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
              placeholder="Where it is, who has it, what still has to happen"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box", fontSize: 13, fontFamily: "var(--clg-font-body)", padding: "10px 12px",
                border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)", resize: "vertical", background: "#fff",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
                {dirty ? "Edited — not yet saved to the unit record" : (row.annual_inspection_notes ? "Saved to the unit record" : "Never edited")}
              </span>
              {dirty && (
                <button
                  onClick={save}
                  disabled={saving}
                  style={{ fontSize: 11.5, fontWeight: 700, color: "var(--clg-royal)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                >
                  {saving && <Loader2 size={12} className="spin" />} Save note
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// Standalone Annual Inspection Compliance console, per the Claude Design
// handoff (2026-09-18): one screen answering "can I put a load on this
// unit today?" for dispatch/safety. One table (not split by type), band
// chips that count only in-service units and double as filters, sorted
// purely by expiration (soonest first -- no red-zone pinning), and a
// notes layer that's explicitly separate from Alvys.
export default function AnnualInspectionComplianceView({ onGoToWorkOrders, onGoToUnits }) {
  const { rows, fleetTotal, noDocumentCount, loading, error, saveNotes } = useAnnualInspectionCompliance();
  const [typeFilter, setTypeFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [bandFilter, setBandFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const setTypeFilterAndCollapse = (v) => { setTypeFilter(v); setExpandedId(null); };
  const setShowInactiveAndCollapse = (v) => { setShowInactive(v); setExpandedId(null); };
  const toggleBandFilter = (band) => { setBandFilter((b) => (b === band ? null : band)); setExpandedId(null); };

  const byType = useMemo(() => rows.filter((r) => typeFilter === "all" || r.type === typeFilter), [rows, typeFilter]);
  const inServiceByType = useMemo(() => byType.filter((r) => r.alvysStatus === "Active"), [byType]);
  const outOfServiceCount = byType.length - inServiceByType.length;

  const counts = useMemo(() => ({
    red: inServiceByType.filter((r) => r.band === "red").length,
    yellow: inServiceByType.filter((r) => r.band === "yellow").length,
    green: inServiceByType.filter((r) => r.band === "green").length,
  }), [inServiceByType]);

  const expiredRows = useMemo(() => inServiceByType.filter((r) => r.overdue).sort((a, b) => a.expiration < b.expiration ? -1 : 1), [inServiceByType]);

  const visible = useMemo(() => {
    return byType
      .filter((r) => showInactive || r.alvysStatus === "Active")
      .filter((r) => !bandFilter || r.band === bandFilter)
      .sort((a, b) => (a.expiration < b.expiration ? -1 : a.expiration > b.expiration ? 1 : 0));
  }, [byType, showInactive, bandFilter]);

  const exportCsv = () => {
    downloadCsv("annual-inspection-compliance.csv", visible, [
      { label: "Unit", value: (r) => r.number },
      { label: "Type", value: (r) => TYPE_LABEL[r.type] || r.type },
      { label: "Alvys status", value: (r) => r.alvysStatus },
      { label: "Expires", value: (r) => r.expiration },
      { label: "Days until due", value: (r) => r.daysUntilDue },
      { label: "Notes", value: (r) => r.annual_inspection_notes || "" },
    ]);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <Eyebrow>Compliance</Eyebrow>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 400, fontSize: 28, color: "var(--clg-navy)", letterSpacing: "-.015em", marginTop: 4 }}>
            DOT annual inspections
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
          <Button variant="secondary" size="sm" disabled title="Not built yet">Schedule inspections</Button>
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 20, maxWidth: 640 }}>
        {ledeFor(expiredRows.length)}
      </div>

      {error && <Alert tone="critical" title="Couldn't load units" style={{ marginBottom: 16 }}>{error}</Alert>}

      <Card padding={14} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["red", "yellow", "green"].map((band) => (
              <CountChip key={band} band={band} count={counts[band]} active={bandFilter === band} onClick={() => toggleBandFilter(band)} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10.5, marginRight: 6 }}>As of</span>
            <strong style={{ color: "var(--clg-text-body)" }}>{fmtDate(new Date().toISOString().slice(0, 10))}</strong>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--clg-text-muted)" }}>
            {inServiceByType.length} in-service units tracked
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilterAndCollapse(f.value)}
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
        <Toggle checked={showInactive} onChange={setShowInactiveAndCollapse} label="Show units not in service" />
        <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
          {showInactive
            ? `${outOfServiceCount} out-of-service unit${outOfServiceCount === 1 ? "" : "s"} shown — they cannot be dispatched, but must clear inspection to return`
            : `${outOfServiceCount} out-of-service unit${outOfServiceCount === 1 ? "" : "s"} hidden`}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--clg-text-muted)" }}>
          Sorted by expiration, soonest first{bandFilter ? " · filtered to one status band" : ""}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--clg-text-muted)" }}>
          <Loader2 size={18} className="spin" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title="No units match" body="Try a different type filter, clear the status band filter, or show out-of-service units." />
      ) : (
        <Card padding={0} style={{ overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--clg-surface-subtle)", textAlign: "left" }}>
                {["Unit", "Type", "Alvys status", "Expires", "Days", "Notes"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      style={{
                        borderTop: "1px solid var(--clg-border-subtle)", cursor: "pointer",
                        background: row.overdue ? "rgba(190,32,46,.04)" : (expanded ? "var(--clg-surface-subtle)" : "transparent"),
                        boxShadow: row.overdue ? "inset 3px 0 0 var(--clg-scarlet)" : "none",
                      }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: BAND_COLOR[row.band] }}>
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: BAND_COLOR[row.band], marginRight: 8 }} />
                        {row.number}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--clg-text-body)" }}>{TYPE_LABEL[row.type] || row.type}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <Badge tone={row.alvysStatus === "Active" ? "neutral" : "critical"}>{row.alvysStatus}</Badge>
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--clg-text-body)" }}>{fmtDate(row.expiration)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: BAND_COLOR[row.band] }}>{fmtDays(row)}</td>
                      <td style={{ padding: "10px 14px", color: row.annual_inspection_notes ? "var(--clg-text-body)" : "var(--clg-text-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.annual_inspection_notes || "No note"}
                      </td>
                    </tr>
                    {expanded && (
                      <ExpandedRow row={row} onSave={saveNotes} onGoToWorkOrders={onGoToWorkOrders} onGoToUnits={onGoToUnits} />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid var(--clg-border-subtle)", fontSize: 11.5, color: "var(--clg-text-muted)" }}>
            <span>Showing {visible.length} of {byType.length} units on file</span>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 20 }}>
        <Card style={{ borderTop: "3px solid var(--clg-scarlet)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-scarlet)", marginBottom: 8 }}>
            {expiredRows.length} in-service unit{expiredRows.length === 1 ? "" : "s"} {expiredRows.length === 1 ? "is" : "are"} expired
          </div>
          <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", lineHeight: 1.5, marginBottom: 12 }}>
            {expiredRows.length > 0
              ? `Each is still marked Active in Alvys, so dispatch can put a load on one today. ${expiredRows[0].number} has been expired for ${Math.abs(expiredRows[0].daysUntilDue)} days — long enough that the paperwork failure is the finding, not the equipment.`
              : "No in-service units are currently past their inspection date."}
          </div>
          {expiredRows.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {expiredRows.map((r) => (
                <span key={r.id} style={{ fontSize: 11, fontWeight: 600, background: "var(--clg-surface-subtle)", color: "var(--clg-text-body)", padding: "3px 8px", borderRadius: "var(--clg-radius-sm)" }}>
                  {r.number} · {Math.abs(r.daysUntilDue)}d
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)", marginBottom: 8 }}>
            This is a partial picture
          </div>
          <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", lineHeight: 1.5, marginBottom: 12 }}>
            {rows.length} units have an inspection date on file{fleetTotal != null ? ` against a fleet of ${fleetTotal}` : ""}. The rest are not compliant or
            non-compliant here — they are simply unknown, and a unit with no date recorded looks identical to one that was never inspected.
          </div>
          <div style={{ borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-body)" }}><strong>{rows.length}</strong> units with an expiration date on file</div>
            {noDocumentCount != null && <div style={{ fontSize: 12.5, color: "var(--clg-text-body)" }}><strong>{noDocumentCount}</strong> checked in Alvys with no certificate on file</div>}
            {fleetTotal != null && <div style={{ fontSize: 12.5, color: "var(--clg-text-body)" }}><strong>{fleetTotal}</strong> units in the fleet</div>}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)", marginBottom: 8 }}>
            Notes are the manual layer
          </div>
          <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", lineHeight: 1.5 }}>
            Alvys has no field for these, so they are kept here and joined on unit number. That makes them editable, searchable, and attached to the unit
            rather than living in somebody's spreadsheet column.
          </div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 10 }}>
            Read-only against Alvys this pass — nothing written here flows back.
          </div>
        </Card>
      </div>
    </div>
  );
}
