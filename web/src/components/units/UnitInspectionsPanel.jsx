import { useState } from "react";
import { ChevronDown, ChevronRight, Printer, Loader2 } from "lucide-react";
import { Badge } from "../../ds";
import { useUnitInspections } from "../../hooks/useUnitInspections";

function statusTone(status) {
  if (status === "ok") return "brand";
  if (status === "fail" || status === "defect_repaired") return "critical";
  return "neutral";
}

function statusLabel(status) {
  if (status === "ok") return "OK";
  if (status === "fail") return "Fail";
  if (status === "defect_repaired") return "Defect";
  return "—";
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Opens a clean, self-contained print view in a new tab -- independent of
// the main app's layout/CSS, so what prints is exactly this form, not
// whatever else happens to be on the Unit page around it.
function printInspection(insp, unitNumber) {
  const checklistRows = (insp.checklist ?? [])
    .map((i) => `<tr><td>${esc(i.label)}</td><td class="status ${esc(i.status)}">${esc(statusLabel(i.status))}</td><td>${esc(i.note)}</td></tr>`)
    .join("");
  const tireRows = (insp.tire_grid ?? [])
    .map((t) => `<tr><td>${esc(t.position)}</td><td>${t.ok === true ? "OK" : t.ok === false ? "Fail" : "—"}</td><td>${esc(t.value)}</td></tr>`)
    .join("");
  const brakeRows = (insp.brake_grid ?? [])
    .map((b) => `<tr><td>${esc(b.position)}</td><td>${esc(b.pad_measurement)}</td><td>${esc(b.adjustment_measurement)}</td><td>${b.ok === true ? "OK" : b.ok === false ? "Fail" : "—"}</td></tr>`)
    .join("");

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <!doctype html><html><head><title>${insp.inspection_kind} inspection — Unit ${esc(unitNumber)} — ${esc(insp.inspected_at)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #222; padding: 24px; max-width: 760px; margin: 0 auto; }
      h1 { font-size: 18px; margin-bottom: 2px; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #555; margin: 22px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      .meta { font-size: 12.5px; color: #444; margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      td, th { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; }
      .status.ok { color: #1a7a3c; font-weight: bold; }
      .status.fail, .status.defect_repaired { color: #b02a2a; font-weight: bold; }
      .sig { max-width: 300px; border: 1px solid #ccc; margin-top: 4px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>CLG Transportation — ${esc(insp.inspection_kind)} Inspection</h1>
    <div class="meta">Unit ${esc(unitNumber)} (${esc(insp.unit_type)}) &middot; Inspected ${esc(insp.inspected_at)} ${insp.mileage ? `&middot; ${esc(insp.mileage)} mi` : ""}</div>
    ${insp.overall_result ? `<div class="meta">Overall result: <strong>${esc(insp.overall_result)}</strong></div>` : ""}
    <h2>Checklist</h2>
    <table>${checklistRows || "<tr><td>None on file</td></tr>"}</table>
    ${insp.tire_grid?.length ? `<h2>Tires</h2><table><tr><th>Position</th><th>Status</th><th>Value</th></tr>${tireRows}</table>` : ""}
    ${insp.brake_grid?.length ? `<h2>Brakes</h2><table><tr><th>Position</th><th>Pad</th><th>Adjustment</th><th>Status</th></tr>${brakeRows}</table>` : ""}
    <h2>Certification</h2>
    <div class="meta">Failed items repaired: ${insp.failed_items_repaired == null ? "—" : insp.failed_items_repaired ? "Yes" : "No"}</div>
    ${insp.defect_repair_details ? `<div class="meta">Defect repair details: ${esc(insp.defect_repair_details)}</div>` : ""}
    <h2>Mechanic sign-off</h2>
    <div class="meta">${esc(insp.mechanic_name)}</div>
    ${insp.mechanic_signature_data ? `<img class="sig" src="${insp.mechanic_signature_data}" />` : ""}
    <div class="meta" style="margin-top:16px;">Filed by ${esc(insp.filed_by)} on ${esc(insp.filed_at ? new Date(insp.filed_at).toLocaleString() : "")}</div>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function InspectionRow({ insp, unitNumber }) {
  const [expanded, setExpanded] = useState(false);
  const failedCount = (insp.checklist ?? []).filter((i) => i.status && i.status !== "ok").length;

  return (
    <div style={{ borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer" }} onClick={() => setExpanded((e) => !e)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{insp.inspected_at}</span>
        <Badge tone="neutral">{insp.inspection_kind}</Badge>
        {insp.overall_result && <Badge tone={insp.overall_result === "Pass" ? "brand" : "critical"}>{insp.overall_result}</Badge>}
        {failedCount > 0 && <span style={{ fontSize: 11.5, color: "var(--clg-scarlet)" }}>{failedCount} flagged</span>}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--clg-text-muted)" }}>{insp.mechanic_name}</span>
        <button
          type="button" title="Print"
          onClick={(e) => { e.stopPropagation(); printInspection(insp, unitNumber); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", display: "flex" }}
        >
          <Printer size={15} />
        </button>
      </div>
      {expanded && (
        <div style={{ padding: "0 0 14px 24px", fontSize: 12.5 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {(insp.checklist ?? []).map((i) => (
              <div key={i.key} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "var(--clg-text-body)" }}>{i.label}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {i.note && <span style={{ color: "var(--clg-text-muted)" }}>{i.note}</span>}
                  <Badge tone={statusTone(i.status)}>{statusLabel(i.status)}</Badge>
                </span>
              </div>
            ))}
          </div>
          {insp.mechanic_signature_data && (
            <img src={insp.mechanic_signature_data} alt="Mechanic signature" style={{ maxWidth: 200, border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)" }} />
          )}
        </div>
      )}
    </div>
  );
}

export default function UnitInspectionsPanel({ unitId, unitNumber }) {
  const { inspections, loading, error } = useUnitInspections(unitId);

  if (loading) return <div style={{ padding: "12px 0", color: "var(--clg-text-muted)" }}><Loader2 size={16} className="spin" /></div>;
  if (error) return <div style={{ padding: "12px 0", color: "var(--clg-scarlet)", fontSize: 13 }}>{error}</div>;
  if (inspections.length === 0) return <div style={{ padding: "12px 0", color: "var(--clg-text-muted)", fontSize: 13 }}>No filed inspections on record for this unit.</div>;

  return (
    <div>
      {inspections.map((insp) => (
        <InspectionRow key={insp.id} insp={insp} unitNumber={unitNumber} />
      ))}
    </div>
  );
}
