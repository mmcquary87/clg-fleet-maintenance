import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { useProfile } from "../../hooks/useProfile";
import { useIsMobile } from "../../hooks/useIsMobile";
import { itemsForUnitType, needsAttention as computeNeedsAttention } from "../../lib/annualInspectionItems";
import { nextDueDate } from "../../lib/maintenanceSchedule";
import PhotoCapture from "../shared/PhotoCapture";
import SignaturePad from "../shared/SignaturePad";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pillStyle(active, tone) {
  const activeBg = tone === "bad" ? "var(--clg-scarlet)" : "var(--clg-navy)";
  return {
    border: "1px solid " + (active ? activeBg : "var(--clg-border-default)"),
    background: active ? activeBg : "#fff",
    color: active ? "#fff" : "var(--clg-text-muted)",
    borderRadius: "var(--clg-radius-sm)", padding: "6px 12px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", flexShrink: 0,
  };
}

function CheckRow({ item, value, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ minWidth: 0, borderLeft: value === false ? "3px solid var(--clg-scarlet)" : "3px solid transparent", paddingLeft: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--clg-text-heading)" }}>{item.label}</div>
        {item.sublabel && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{item.sublabel}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={() => onChange(true)} style={pillStyle(value === true, "good")}>OK</button>
        <button type="button" onClick={() => onChange(false)} style={pillStyle(value === false, "bad")}>Defect</button>
      </div>
    </div>
  );
}

// Mechanic-facing filing form for the DOT Annual Inspection (49 CFR 396.17),
// the counterpart to TractorInspectionForm's own hand-off inspection and
// MidTripInspectionForm -- those are filed, this one wasn't (only a
// read-side compliance dashboard existed, AnnualInspectionComplianceView).
// Checklist item set depends on unit_type (see annualInspectionItems.js)
// since a truck tractor and a trailer are inspected against different
// Appendix A systems. Filing updates units.last_annual_inspection_date
// (the same field AnnualInspectionComplianceView and the Service tab's
// MilestoneRow already read via ANNUAL_INSPECTION_INTERVAL_DAYS) and raises
// a work order for every item marked Defect, same as TractorInspectionForm.
export default function AnnualInspectionForm({ onCancel, onFiled }) {
  const { session } = useAuth();
  const { profile } = useProfile(session?.user?.id);
  const isMobile = useIsMobile();

  const [unitNumber, setUnitNumber] = useState("");
  const [unitId, setUnitId] = useState(null);
  const [unitType, setUnitType] = useState("Truck");
  const [unitNotFound, setUnitNotFound] = useState(false);
  const [looking, setLooking] = useState(false);
  const [inspectedAt, setInspectedAt] = useState(todayIso());
  const [odometer, setOdometer] = useState("");
  const [itemResults, setItemResults] = useState({});
  const [notes, setNotes] = useState("");
  const [inspectorName, setInspectorName] = useState(profile?.full_name || "");
  const [signatureData, setSignatureData] = useState(null);
  const [certified, setCertified] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const items = itemsForUnitType(unitType);
  const setItem = (key) => (value) => setItemResults((r) => ({ ...r, [key]: value }));
  const failed = computeNeedsAttention(itemResults, items);
  const uncheckedCount = items.length - items.filter((i) => itemResults[i.key] != null).length;
  const projectedNextDue = nextDueDate(inspectedAt, 364);
  const canFile = unitId && certified && inspectorName.trim() && signatureData;

  const lookupUnit = async () => {
    const number = unitNumber.trim();
    if (!number) return;
    setLooking(true);
    setUnitId(null);
    const { data } = await supabase.from("units").select("id, number, type").ilike("number", number).maybeSingle();
    setUnitId(data?.id ?? null);
    setUnitNotFound(!data);
    if (data) setUnitType(data.type === "Trailer" ? "Trailer" : "Truck");
    setLooking(false);
  };

  const save = async (status) => {
    if (!unitId) { setError("Look up a real unit number first."); return; }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const { data: inspection, error: err } = await supabase
        .from("annual_inspections")
        .insert({
          unit_id: unitId,
          unit_type: unitType,
          status,
          inspected_at: inspectedAt,
          odometer: odometer.trim() === "" ? null : Number(odometer),
          item_results: itemResults,
          notes: notes.trim() || null,
          inspector_name: inspectorName.trim() || null,
          inspector_signature_name: inspectorName.trim() || null,
          inspector_signature_data: signatureData,
          inspector_signed_at: signatureData ? now : null,
          certification_statement_accepted: certified,
          filed_by: status === "filed" ? (profile?.full_name || session?.user?.email || null) : null,
          filed_at: status === "filed" ? now : null,
        })
        .select("id")
        .single();
      if (err) throw err;

      for (const p of photos) {
        const path = `${unitId}/annual-inspections/${inspection.id}/${crypto.randomUUID()}-${p.file.name}`;
        const { error: uploadErr } = await supabase.storage.from("unit-documents").upload(path, p.file);
        if (uploadErr) throw uploadErr;
        const { error: docErr } = await supabase.from("unit_documents").insert({
          unit_id: unitId, annual_inspection_id: inspection.id, doc_type: "annual_inspection_photo",
          storage_path: path, file_name: p.file.name, uploaded_by: session?.user?.id ?? null,
        });
        if (docErr) throw docErr;
      }

      let raisedCount = 0;
      if (status === "filed") {
        if (failed.length > 0) {
          const woRows = failed.map((item) => ({
            unit_id: unitId,
            category: item.category,
            complaint: `${item.label}${item.sublabel ? " — " + item.sublabel : ""} — marked as a defect on the annual inspection`,
            severity: "Urgent",
            status: "Open",
            intake_source: "manual",
            source: "manual",
            date_opened: inspectedAt,
            annual_inspection_id: inspection.id,
          }));
          const { error: woErr } = await supabase.from("work_orders").insert(woRows);
          if (woErr) throw woErr;
          raisedCount = woRows.length;
        }
        const { error: unitErr } = await supabase.from("units").update({ last_annual_inspection_date: inspectedAt }).eq("id", unitId);
        if (unitErr) throw unitErr;
      }

      onFiled(inspection.id, raisedCount);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 80px" }}>
      <button onClick={onCancel} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", marginBottom: 16, fontSize: 13 }}>
        <ChevronLeft size={16} /> Back to queue
      </button>

      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)", marginBottom: 4 }}>
        Annual (DOT) inspection
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 20 }}>
        Minimum periodic inspection per 49 CFR Part 396, Appendix A. Anything marked Defect becomes a work order
        when the form is filed.
      </div>

      {error && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 20, alignItems: "start" }}>
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <Field label="Unit #" required>
                <div style={{ display: "flex", gap: 6 }}>
                  <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} onBlur={lookupUnit} placeholder="e.g. 3307" />
                  {looking && <Loader2 size={16} className="spin" style={{ alignSelf: "center", color: "var(--clg-text-muted)" }} />}
                </div>
                {unitNotFound && <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginTop: 4 }}>No unit found with that number.</div>}
              </Field>
              <Field label="Unit type">
                <Select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  options={[{ value: "Truck", label: "Truck / tractor" }, { value: "Trailer", label: "Trailer" }]}
                />
              </Field>
              <Field label="Date"><Input type="date" value={inspectedAt} onChange={(e) => setInspectedAt(e.target.value)} /></Field>
              <Field label="Odometer"><Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="mi" /></Field>
            </div>
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>
                {unitType === "Trailer" ? "Trailer" : "Truck tractor"} inspection items
              </div>
              <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{items.length} items</div>
            </div>
            {items.map((item) => (
              <CheckRow key={item.key} item={item} value={itemResults[item.key]} onChange={setItem(item.key)} />
            ))}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--clg-navy)", marginBottom: 6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything not captured above"
              style={{
                width: "100%", boxSizing: "border-box", fontSize: 16, fontFamily: "var(--clg-font-body)",
                color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
                borderRadius: "var(--clg-radius-sm)", padding: 14, resize: "vertical",
              }}
            />
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12 }}>
              Document overall condition or any defect called out above.
            </div>
            <PhotoCapture photos={photos} onChange={setPhotos} />
          </Card>

          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-brand)", marginBottom: 10 }}>
              Inspector certification
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, padding: 12, background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
              <input
                type="checkbox"
                checked={certified}
                onChange={(e) => setCertified(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
              />
              <div style={{ fontSize: 12.5, color: "var(--clg-text-body)" }}>
                I certify this vehicle has been inspected in accordance with the minimum periodic inspection
                standards of 49 CFR Part 396, Appendix A, and that this report accurately reflects the result.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Inspector — print name" required>
                <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="Print name" />
              </Field>
              <Field label="Signature" required>
                <SignaturePad value={signatureData} onChange={setSignatureData} />
              </Field>
            </div>
          </Card>
        </div>

        <div style={isMobile ? undefined : { position: "sticky", top: 16 }}>
          <Card style={{ marginBottom: 16, borderTop: "3px solid " + (failed.length > 0 ? "var(--clg-scarlet)" : "var(--clg-royal)") }}>
            {failed.length > 0 ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-scarlet)", marginBottom: 8 }}>
                  Raises {failed.length} work order{failed.length === 1 ? "" : "s"} on filing
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {failed.map((item) => (
                    <div key={item.key} style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: "8px 10px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--clg-navy)" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "var(--clg-text-muted)" }}>Marked as a defect on this inspection</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12 }}>Nothing flagged yet.</div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 4 }}>
              {uncheckedCount} item{uncheckedCount === 1 ? "" : "s"} still unchecked
            </div>
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 4 }}>
              Next due if filed today: {projectedNextDue}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 14 }}>
              {canFile ? "Ready to file" : "Certification, inspector name & signature required to file"}
            </div>
            <Button
              onClick={() => save("filed")}
              disabled={saving || !canFile}
              iconLeft={saving ? <Loader2 size={14} className="spin" /> : null}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {saving ? "Filing…" : "File inspection · Raise work orders"}
            </Button>
            <button
              onClick={() => save("draft")}
              disabled={saving || !unitId}
              style={{ width: "100%", background: "none", border: "none", color: "var(--clg-royal)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              Save as draft
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
