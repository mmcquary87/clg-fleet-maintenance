import { useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { useProfile } from "../../hooks/useProfile";
import { EQUIPMENT_ITEMS, WALKAROUND_ITEMS, DOCUMENT_ITEMS, ALL_CHECK_ITEMS, countChecked } from "../../lib/tractorInspectionItems";
import PhotoCapture from "../shared/PhotoCapture";
import SignaturePad from "../shared/SignaturePad";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function moneyFmt(n) {
  return `$${Math.round(n || 0).toLocaleString()}`;
}

function emptyForm(unitNumber = "") {
  const base = {
    unit_number: unitNumber,
    inspection_type: "assignment",
    inspected_at: todayIso(),
    driver_name: "", odometer: "", tag_plate: "", smoker: null,
    prepass_transponder_number: "", loves_rfid_number: "", kill_switch_location: "", mattress_condition: "",
    fire_ext_present: null, fire_ext_charge_level: "", fire_ext_secured: null, fire_ext_location: "",
    fuel_level: "", coolant_level: "", oil_level: "", wiper_fluid_level: "", brake_fluid_level: "",
    cab_notes: "", exterior_notes: "", damage_defects_notes: "",
    driver_signature_name: "", clg_signature_name: "",
    driver_signature_data: null, clg_signature_data: null,
    correction_dates: "",
  };
  for (const item of ALL_CHECK_ITEMS) base[item.key] = null;
  return base;
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

function SectionCard({ title, count, children, style }) {
  return (
    <Card style={{ marginBottom: 16, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>{title}</div>
        {count != null && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{count} item{count === 1 ? "" : "s"}</div>}
      </div>
      {children}
    </Card>
  );
}

function CheckRow({ item, value, onChange, photos, onPhotosChange }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0, borderLeft: value === false ? "3px solid var(--clg-scarlet)" : "3px solid transparent", paddingLeft: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--clg-text-heading)" }}>{item.label}</div>
          {item.sublabel && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{item.sublabel}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => onChange(true)} style={pillStyle(value === true, "good")}>{item.goodLabel || "Yes"}</button>
          <button type="button" onClick={() => onChange(false)} style={pillStyle(value === false, "bad")}>{item.badLabel || "No"}</button>
        </div>
      </div>
      {item.hasPhoto && (
        <div style={{ marginTop: 10, paddingLeft: 8 }}>
          <PhotoCapture photos={photos} onChange={onPhotosChange} />
        </div>
      )}
    </div>
  );
}

// Full digital replacement for CLG's paper tractor assignment/return
// inspection (design uploaded 2026-09-16). Separate and manual, not
// connected to the Samsara-synced dvir_defects table -- that's the
// DOT-mandated electronic DVIR, this is CLG's own equipment-condition
// checklist at hand-off. Filing raises a real work order for every item
// marked No/Needs attention (see tractorInspectionItems.js for the
// category/severity each maps to) instead of the finding ending up in a
// filing cabinet.
//
// Scope note: this ships filing + auto-raised work orders, the core of
// what the design calls for. "Print blank form" and a browsable "Past
// inspections" list (including resuming a saved draft) are left as
// follow-ups -- a Save as Draft here still persists the record, just
// without a list view to find it again yet.
export default function TractorInspectionForm({ onCancel, onFiled }) {
  const { session } = useAuth();
  const { profile } = useProfile(session?.user?.id);
  const [form, setForm] = useState(emptyForm());
  const [unitId, setUnitId] = useState(null);
  const [unitNotFound, setUnitNotFound] = useState(false);
  const [looking, setLooking] = useState(false);
  const [unitStats, setUnitStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [cellTabletPhotos, setCellTabletPhotos] = useState([]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setInput = (key) => (e) => set(key)(e.target.value);

  const lookupUnit = async () => {
    const number = form.unit_number.trim();
    if (!number) return;
    setLooking(true);
    setUnitId(null);
    setUnitStats(null);
    const { data } = await supabase.from("units").select("id, number").ilike("number", number).maybeSingle();
    setUnitId(data?.id ?? null);
    setUnitNotFound(!data);
    setLooking(false);
  };

  useEffect(() => {
    if (!unitId) return;
    let cancelled = false;
    (async () => {
      const [openRes, lastInspRes, closedRes] = await Promise.all([
        supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("unit_id", unitId).eq("voided", false).neq("status", "Closed"),
        supabase.from("tractor_inspections").select("inspected_at").eq("unit_id", unitId).eq("status", "filed").order("inspected_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("work_orders").select("cost, date_closed").eq("unit_id", unitId).eq("voided", false).eq("status", "Closed"),
      ]);
      if (cancelled) return;
      const ytdSpend = (closedRes.data ?? [])
        .filter((o) => o.date_closed && new Date(o.date_closed).getFullYear() === new Date().getFullYear())
        .reduce((s, o) => s + (Number(o.cost) || 0), 0);
      setUnitStats({
        openCount: openRes.count ?? 0,
        lastInspection: lastInspRes.data?.inspected_at ?? null,
        ytdSpend,
      });
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  const checkedCount = countChecked(form);
  const needsAttention = ALL_CHECK_ITEMS.filter((item) => form[item.key] === false);
  const totalItems = ALL_CHECK_ITEMS.length;
  const missingSignature = !form.driver_signature_name.trim() || !form.driver_signature_data
    || !form.clg_signature_name.trim() || !form.clg_signature_data;

  const buildInsertPayload = (status) => {
    const { unit_number, ...rest } = form; // eslint-disable-line no-unused-vars
    const now = new Date().toISOString();
    return {
      ...rest,
      unit_id: unitId,
      odometer: form.odometer.trim() === "" ? null : Number(form.odometer),
      status,
      filed_by: status === "filed" ? (profile?.full_name || session?.user?.email || null) : null,
      filed_at: status === "filed" ? now : null,
      driver_signed_at: form.driver_signature_name.trim() ? now : null,
      clg_signed_at: form.clg_signature_name.trim() ? now : null,
    };
  };

  const save = async (status) => {
    if (!unitId) { setError("Look up a real unit number first."); return; }
    setSaving(true);
    setError(null);
    try {
      const { data: inspection, error: err } = await supabase
        .from("tractor_inspections")
        .insert(buildInsertPayload(status))
        .select("id")
        .single();
      if (err) throw err;

      const allPhotos = [
        ...photos.map((p) => ({ ...p, note: null })),
        ...cellTabletPhotos.map((p) => ({ ...p, note: "Mount for cell / tablet" })),
      ];
      for (const p of allPhotos) {
        const path = `${unitId}/tractor-inspections/${inspection.id}/${crypto.randomUUID()}-${p.file.name}`;
        const { error: uploadErr } = await supabase.storage.from("unit-documents").upload(path, p.file);
        if (uploadErr) throw uploadErr;
        const { error: docErr } = await supabase.from("unit_documents").insert({
          unit_id: unitId, tractor_inspection_id: inspection.id, doc_type: "tractor_inspection_photo",
          storage_path: path, file_name: p.file.name, note: p.note, uploaded_by: session?.user?.id ?? null,
        });
        if (docErr) throw docErr;
      }

      let raisedCount = 0;
      if (status === "filed" && needsAttention.length > 0) {
        const rows = needsAttention.map((item) => ({
          unit_id: unitId,
          category: item.category,
          complaint: `${item.label}${item.sublabel ? " — " + item.sublabel : ""} — marked as needing attention on this inspection`,
          severity: item.severity || "Routine",
          status: "Open",
          intake_source: "manual",
          source: "manual",
          date_opened: form.inspected_at,
          tractor_inspection_id: inspection.id,
        }));
        const { error: woErr } = await supabase.from("work_orders").insert(rows);
        if (woErr) throw woErr;
        raisedCount = rows.length;
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
        Assigned tractor inspection
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 20 }}>
        Inspect the vehicle to identify damage and defects on assignment and again on return. Anything marked
        needs attention becomes a work order when the form is filed.
      </div>

      {error && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => set("inspection_type")("assignment")}
                style={{ ...pillStyle(form.inspection_type === "assignment", "good"), padding: "8px 16px" }}
              >
                On assignment
              </button>
              <button
                onClick={() => set("inspection_type")("return")}
                style={{ ...pillStyle(form.inspection_type === "return", "good"), padding: "8px 16px" }}
              >
                On return
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
              <Field label="Truck #" required>
                <div style={{ display: "flex", gap: 6 }}>
                  <Input value={form.unit_number} onChange={setInput("unit_number")} onBlur={lookupUnit} placeholder="e.g. 3307" />
                  {looking && <Loader2 size={16} className="spin" style={{ alignSelf: "center", color: "var(--clg-text-muted)" }} />}
                </div>
                {unitNotFound && <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginTop: 4 }}>No unit found with that number.</div>}
              </Field>
              <Field label="Date"><Input type="date" value={form.inspected_at} onChange={setInput("inspected_at")} /></Field>
              <Field label="Driver"><Input value={form.driver_name} onChange={setInput("driver_name")} /></Field>
              <Field label="Odometer"><Input type="number" value={form.odometer} onChange={setInput("odometer")} placeholder="mi" /></Field>
              <Field label="Tag state / #"><Input value={form.tag_plate} onChange={setInput("tag_plate")} /></Field>
              <Field label="Smoker">
                <Select
                  value={form.smoker == null ? "" : form.smoker ? "yes" : "no"}
                  onChange={(e) => set("smoker")(e.target.value === "" ? null : e.target.value === "yes")}
                  placeholder="—"
                  options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                />
              </Field>
            </div>
          </Card>

          <SectionCard title="Equipment on the tractor" count={EQUIPMENT_ITEMS.length}>
            {EQUIPMENT_ITEMS.map((item) => (
              <CheckRow
                key={item.key} item={item} value={form[item.key]} onChange={set(item.key)}
                photos={item.hasPhoto ? cellTabletPhotos : undefined}
                onPhotosChange={item.hasPhoto ? setCellTabletPhotos : undefined}
              />
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 14 }}>
              <Field label="Prepass transponder #"><Input value={form.prepass_transponder_number} onChange={setInput("prepass_transponder_number")} /></Field>
              <Field label="Love's RFID #"><Input value={form.loves_rfid_number} onChange={setInput("loves_rfid_number")} /></Field>
              <Field label="Kill switch location"><Input value={form.kill_switch_location} onChange={setInput("kill_switch_location")} /></Field>
            </div>
            <div style={{ marginTop: 14, maxWidth: 240 }}>
              <Field label="Mattress condition"><Input value={form.mattress_condition} onChange={setInput("mattress_condition")} placeholder="e.g. Acceptable" /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Walkaround" count={WALKAROUND_ITEMS.length}>
            {WALKAROUND_ITEMS.map((item) => (
              <CheckRow key={item.key} item={item} value={form[item.key]} onChange={set(item.key)} />
            ))}
          </SectionCard>

          <SectionCard title="Fire extinguisher">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
              <Field label="Present">
                <Select value={form.fire_ext_present == null ? "" : form.fire_ext_present ? "yes" : "no"}
                  onChange={(e) => set("fire_ext_present")(e.target.value === "" ? null : e.target.value === "yes")}
                  placeholder="—" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              </Field>
              <Field label="Secured">
                <Select value={form.fire_ext_secured == null ? "" : form.fire_ext_secured ? "yes" : "no"}
                  onChange={(e) => set("fire_ext_secured")(e.target.value === "" ? null : e.target.value === "yes")}
                  placeholder="—" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              </Field>
              <Field label="Charge level"><Input value={form.fire_ext_charge_level} onChange={setInput("fire_ext_charge_level")} placeholder="e.g. Full — in the green" /></Field>
            </div>
            <Field label="Location" style={{ maxWidth: 320 }}><Input value={form.fire_ext_location} onChange={setInput("fire_ext_location")} placeholder="e.g. Cab, passenger footwell" /></Field>
          </SectionCard>

          <SectionCard title="Fluid levels">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
              <Field label="Fuel"><Input value={form.fuel_level} onChange={setInput("fuel_level")} placeholder="e.g. 7/8" /></Field>
              <Field label="Coolant"><Input value={form.coolant_level} onChange={setInput("coolant_level")} placeholder="Full" /></Field>
              <Field label="Oil"><Input value={form.oil_level} onChange={setInput("oil_level")} placeholder="Full" /></Field>
              <Field label="Wiper"><Input value={form.wiper_fluid_level} onChange={setInput("wiper_fluid_level")} placeholder="Not recorded" /></Field>
              <Field label="Brake fluid"><Input value={form.brake_fluid_level} onChange={setInput("brake_fluid_level")} placeholder="Full" /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Binder — required documents" count={DOCUMENT_ITEMS.length}>
            {DOCUMENT_ITEMS.map((item) => (
              <CheckRow key={item.key} item={item} value={form[item.key]} onChange={set(item.key)} />
            ))}
          </SectionCard>

          <SectionCard title="Defects & cleanliness">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Cab"><Input value={form.cab_notes} onChange={setInput("cab_notes")} placeholder="e.g. Clean. Driver-side floor mat worn through at the heel, not a defect." /></Field>
              <Field label="Exterior"><Input value={form.exterior_notes} onChange={setInput("exterior_notes")} /></Field>
              <Field label="Damage / defects to correct"><Input value={form.damage_defects_notes} onChange={setInput("damage_defects_notes")} /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Photos">
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12 }}>
              Document overall condition or anything called out above — a live camera shot or a file from the device.
            </div>
            <PhotoCapture photos={photos} onChange={setPhotos} />
          </SectionCard>

          <SectionCard title="Signatures">
            <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginBottom: 14 }}>
              By signing, I affirm I received the tractor with the equipment listed above. I inspected the vehicle
              and confirm all items are in good, proper working condition unless otherwise indicated.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <Field label="Driver — print name" style={{ marginBottom: 10 }}>
                  <Input value={form.driver_signature_name} onChange={setInput("driver_signature_name")} placeholder="Print name" />
                </Field>
                <Field label="Signature">
                  <SignaturePad value={form.driver_signature_data} onChange={set("driver_signature_data")} />
                </Field>
              </div>
              <div>
                <Field label="CLG — print name" style={{ marginBottom: 10 }}>
                  <Input value={form.clg_signature_name} onChange={setInput("clg_signature_name")} placeholder="Print name" />
                </Field>
                <Field label="Signature">
                  <SignaturePad value={form.clg_signature_data} onChange={set("clg_signature_data")} />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Company use" style={{ background: "var(--clg-surface-subtle)" }}>
            <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginBottom: 12 }}>Not visible to the driver</div>
            <Field label="Correction dates" style={{ maxWidth: 320 }}>
              <Input value={form.correction_dates} onChange={setInput("correction_dates")} placeholder="Recorded as each defect closes" />
            </Field>
          </SectionCard>
        </div>

        <div style={{ position: "sticky", top: 16 }}>
          <Card style={{ marginBottom: 16, borderTop: "3px solid " + (needsAttention.length > 0 ? "var(--clg-scarlet)" : "var(--clg-royal)") }}>
            {needsAttention.length > 0 ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-scarlet)", marginBottom: 8 }}>
                  Raises {needsAttention.length} work order{needsAttention.length === 1 ? "" : "s"} on filing
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {needsAttention.map((item) => (
                    <div key={item.key} style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: "8px 10px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--clg-navy)" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "var(--clg-text-muted)" }}>Marked as needing attention on this inspection</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12 }}>Nothing flagged yet.</div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 4 }}>
              {totalItems - checkedCount} item{totalItems - checkedCount === 1 ? "" : "s"} still unchecked
            </div>
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 14 }}>
              {missingSignature ? "Signature outstanding" : "Both signatures on file"}
            </div>
            <Button
              onClick={() => save("filed")}
              disabled={saving || !unitId}
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

          {unitId && unitStats && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-brand)", marginBottom: 10 }}>
                Unit {form.unit_number}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: "var(--clg-text-muted)" }}>Open work orders</span>
                  <span style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{unitStats.openCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: "var(--clg-text-muted)" }}>Last inspection</span>
                  <span style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{unitStats.lastInspection || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: "var(--clg-text-muted)" }}>Spend YTD</span>
                  <span style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{moneyFmt(unitStats.ytdSpend)}</span>
                </div>
              </div>
            </Card>
          )}

          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", lineHeight: 1.6, padding: "0 4px" }}>
            <strong style={{ color: "var(--clg-text-body)" }}>Why this form is here:</strong> on paper this inspection
            ends in a filing cabinet and the defects get re-found weeks later. Filed here, findings become real work
            orders immediately, tied to the unit's own record.
          </div>
        </div>
      </div>
    </div>
  );
}
