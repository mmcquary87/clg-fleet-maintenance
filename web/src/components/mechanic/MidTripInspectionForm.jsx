import { useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, Field, Input, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";
import { useProfile } from "../../hooks/useProfile";
import {
  TRACTOR_WALKAROUND_ITEMS, TRACTOR_UNDER_HOOD_TRUCK_ITEMS, TRACTOR_FIFTH_WHEEL_ITEMS,
  TRACTOR_ALL_CHECK_ITEMS, TRACTOR_TIRE_POSITIONS, TRACTOR_BRAKE_POSITIONS, PM_SERVICE_LEVELS,
  TRAILER_BRAKE_SYSTEM_ITEMS, TRAILER_CATEGORY_ITEMS, TRAILER_ALL_CHECK_ITEMS,
  TRAILER_TIRE_POSITIONS, TRAILER_BRAKE_LINING_POSITIONS, countChecked,
} from "../../lib/midTripInspectionItems";
import SignaturePad from "../shared/SignaturePad";
import ChargebackDriverPicker from "../shared/ChargebackDriverPicker";

function moneyFmt(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    unit_number: "", inspected_at: todayIso(),
    driver_name: "", mileage: "", vin: "", pm_service_level: "", overall_result: null,
    trailer_year: "", trailer_make: "", abs_equipped: null,
    failed_items_repaired: null, reinspected_and_passed: null, reinspection_date: "",
    defect_repair_details: "",
    mechanic_name: "", mechanic_signature_data: null,
    service_facility_name: "CLG Transportation LLC",
    service_facility_address: "4100 Southpoint Dr E, Ste 3, Jacksonville, FL 32216",
    service_facility_phone: "904-404-8787",
  };
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

// Generic checklist row -- works for both the tractor's OK/Fail rows and
// the trailer's OK/Defect Repaired rows, since `checklist` is a flat
// array of { key, status } rather than one column per item (this form
// doesn't raise work orders, so there's no need to scan fixed columns
// for "false" the way tractor_inspections does).
function ChecklistRow({ item, status, onChange, badLabel }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ minWidth: 0, borderLeft: status && status !== "ok" ? "3px solid var(--clg-scarlet)" : "3px solid transparent", paddingLeft: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--clg-text-heading)" }}>{item.label}</div>
        {item.sublabel && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2, maxWidth: 560 }}>{item.sublabel}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={() => onChange("ok")} style={pillStyle(status === "ok", "good")}>OK</button>
        <button type="button" onClick={() => onChange("fail")} style={pillStyle(status && status !== "ok", "bad")}>{badLabel}</button>
      </div>
    </div>
  );
}

function checklistFor(items) {
  return items.map((item) => ({ key: item.key, label: item.label, status: null, note: "" }));
}

function tireGridFor(positions) {
  return positions.map((position) => ({ position, ok: null, value: "" }));
}

function brakeGridFor(positions) {
  return positions.map((position) => ({ position, pad_measurement: "", adjustment_measurement: "", ok: null }));
}

function updateByKey(list, key, patch) {
  return list.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

function updateByPosition(list, position, patch) {
  return list.map((row) => (row.position === position ? { ...row, ...patch } : row));
}

// Digital replacement for CLG's paper "PM Safety Check" mid-trip
// inspection forms (uploaded 2026-09-18) -- one tractor variant, one
// trailer variant, sharing this form shell but rendering different
// checklists based on the looked-up unit's type. Unlike the Tractor
// (assignment/return) inspection, filing this does NOT raise work
// orders -- it's a record of the periodic safety check only (per CLG,
// 2026-09-18); anyone who finds something that needs fixing opens a work
// order separately.
export default function MidTripInspectionForm({ onCancel, onFiled }) {
  const { session } = useAuth();
  const { profile } = useProfile(session?.user?.id);
  const [form, setForm] = useState(emptyForm());
  const [unitId, setUnitId] = useState(null);
  const [unitType, setUnitType] = useState(null);
  const [unitNotFound, setUnitNotFound] = useState(false);
  const [looking, setLooking] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [tireGrid, setTireGrid] = useState([]);
  const [brakeGrid, setBrakeGrid] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isChargeback, setIsChargeback] = useState(false);
  const [chargebackDriver, setChargebackDriver] = useState("");
  const [chargebackDriverId, setChargebackDriverId] = useState(null);
  const [midtripFeeAmount, setMidtripFeeAmount] = useState(null);

  useEffect(() => {
    supabase.from("app_settings").select("midtrip_chargeback_amount").single().then(({ data }) => {
      setMidtripFeeAmount(data?.midtrip_chargeback_amount ?? null);
    });
  }, []);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setInput = (key) => (e) => set(key)(e.target.value);

  const lookupUnit = async () => {
    const number = form.unit_number.trim();
    if (!number) return;
    setLooking(true);
    setUnitId(null);
    setUnitType(null);
    const { data } = await supabase.from("units").select("id, number, type, vin").ilike("number", number).maybeSingle();
    setUnitId(data?.id ?? null);
    setUnitNotFound(!data);
    setUnitType(data?.type ?? null);
    if (data?.type === "Trailer") {
      setChecklist(checklistFor(TRAILER_ALL_CHECK_ITEMS));
      setTireGrid(tireGridFor(TRAILER_TIRE_POSITIONS));
      setBrakeGrid(brakeGridFor(TRAILER_BRAKE_LINING_POSITIONS));
    } else if (data) {
      setChecklist(checklistFor(TRACTOR_ALL_CHECK_ITEMS));
      setTireGrid(tireGridFor(TRACTOR_TIRE_POSITIONS));
      setBrakeGrid(brakeGridFor(TRACTOR_BRAKE_POSITIONS));
      if (data.vin) set("vin")(data.vin);
    }
    setLooking(false);
  };

  const isTrailer = unitType === "Trailer";
  const checkedCount = countChecked(checklist);
  const totalItems = checklist.length;
  const missingSignature = !form.mechanic_name.trim() || !form.mechanic_signature_data;

  const buildInsertPayload = (status) => {
    const { unit_number, ...rest } = form; // eslint-disable-line no-unused-vars
    const now = new Date().toISOString();
    return {
      ...rest,
      unit_id: unitId,
      unit_type: unitType,
      status,
      mileage: form.mileage.trim() === "" ? null : Number(form.mileage),
      reinspection_date: form.reinspection_date || null,
      checklist,
      tire_grid: tireGrid,
      brake_grid: brakeGrid,
      filed_by: status === "filed" ? (profile?.full_name || session?.user?.email || null) : null,
      filed_at: status === "filed" ? now : null,
      mechanic_signed_at: form.mechanic_name.trim() ? now : null,
    };
  };

  const save = async (status) => {
    if (!unitId) { setError("Look up a real unit number first."); return; }
    setSaving(true);
    setError(null);
    try {
      const { data: inspection, error: err } = await supabase
        .from("mid_trip_inspections")
        .insert(buildInsertPayload(status))
        .select("id")
        .single();
      if (err) throw err;

      // Keep the roster's PM-compliance due/overdue badge (maintenanceSchedule.js)
      // in sync with this form -- the same field a "DOT Inspection" work order
      // tagged inspectionType "Midtrip" already updates on close, so the two
      // don't silently drift apart into two different "when was this last done"
      // answers.
      if (status === "filed") {
        const { error: unitErr } = await supabase
          .from("units")
          .update({ last_midtrip_date: form.inspected_at })
          .eq("id", unitId);
        if (unitErr) throw unitErr;

        // Reuses the existing work_orders chargeback mechanism (same
        // is_chargeback/chargeback_driver_id fields NewWorkOrderForm and
        // WorkOrderDetailModal use) so this flat fee shows up in the
        // existing Deductions report and Spend/Intacct export for free,
        // rather than a parallel ledger. Closed immediately -- there's no
        // repair to work, just a fee to bill.
        if (isChargeback) {
          const { error: feeErr } = await supabase.from("work_orders").insert({
            unit_id: unitId,
            category: "DOT Inspection",
            description: "Mid-trip inspection fee",
            cost: midtripFeeAmount ?? 0,
            status: "Closed",
            date_opened: form.inspected_at,
            date_closed: form.inspected_at,
            intake_source: "manual",
            source: "manual",
            is_chargeback: true,
            chargeback_driver_name: chargebackDriver.trim() || null,
            chargeback_driver_id: chargebackDriverId,
            mid_trip_inspection_id: inspection.id,
          });
          if (feeErr) throw feeErr;
        }
      }

      onFiled(inspection.id);
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
        Mid-trip PM safety check
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 20 }}>
        Periodic mechanical/safety inspection per 49 CFR 393 and 396. This records pass/fail only — it does not raise
        work orders. Open one separately for anything that needs fixing.
      </div>

      {error && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <Field label="Unit #" required>
                <div style={{ display: "flex", gap: 6 }}>
                  <Input value={form.unit_number} onChange={setInput("unit_number")} onBlur={lookupUnit} placeholder="e.g. 3307" />
                  {looking && <Loader2 size={16} className="spin" style={{ alignSelf: "center", color: "var(--clg-text-muted)" }} />}
                </div>
                {unitNotFound && <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginTop: 4 }}>No unit found with that number.</div>}
                {unitType && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>{unitType}</div>}
              </Field>
              <Field label="Date"><Input type="date" value={form.inspected_at} onChange={setInput("inspected_at")} /></Field>
              {!isTrailer && unitId && (
                <>
                  <Field label="Driver"><Input value={form.driver_name} onChange={setInput("driver_name")} /></Field>
                  <Field label="Mileage"><Input type="number" value={form.mileage} onChange={setInput("mileage")} /></Field>
                  <Field label="VIN"><Input value={form.vin} onChange={setInput("vin")} /></Field>
                  <Field label="PM service level">
                    <Select value={form.pm_service_level} onChange={setInput("pm_service_level")} placeholder="—" options={PM_SERVICE_LEVELS} />
                  </Field>
                  <Field label="Overall result">
                    <Select
                      value={form.overall_result ?? ""}
                      onChange={(e) => set("overall_result")(e.target.value || null)}
                      placeholder="—" options={[{ value: "Pass", label: "Pass" }, { value: "Fail", label: "Fail" }]}
                    />
                  </Field>
                </>
              )}
              {isTrailer && (
                <>
                  <Field label="Year"><Input value={form.trailer_year} onChange={setInput("trailer_year")} /></Field>
                  <Field label="Make"><Input value={form.trailer_make} onChange={setInput("trailer_make")} /></Field>
                  <Field label="ABS equipped">
                    <Select
                      value={form.abs_equipped == null ? "" : form.abs_equipped ? "yes" : "no"}
                      onChange={(e) => set("abs_equipped")(e.target.value === "" ? null : e.target.value === "yes")}
                      placeholder="—" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                    />
                  </Field>
                </>
              )}
            </div>
          </Card>

          {!isTrailer && unitId && (
            <>
              <SectionCard title="Walk around / in cab" count={TRACTOR_WALKAROUND_ITEMS.length}>
                {TRACTOR_WALKAROUND_ITEMS.map((item) => (
                  <ChecklistRow key={item.key} item={item} badLabel="Fail" status={checklist.find((c) => c.key === item.key)?.status}
                    onChange={(s) => setChecklist((list) => updateByKey(list, item.key, { status: s }))} />
                ))}
              </SectionCard>

              <SectionCard title="Tires — tread depth & air pressure">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 24px" }}>
                  {TRACTOR_TIRE_POSITIONS.map((position) => {
                    const row = tireGrid.find((t) => t.position === position);
                    return (
                      <div key={position} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{position}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => setTireGrid((g) => updateByPosition(g, position, { ok: true }))} style={pillStyle(row?.ok === true, "good")}>OK</button>
                          <button type="button" onClick={() => setTireGrid((g) => updateByPosition(g, position, { ok: false }))} style={pillStyle(row?.ok === false, "bad")}>Fail</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Brakes — pad & adjustment measurement (min 1/4)">
                {TRACTOR_BRAKE_POSITIONS.map((position) => {
                  const row = brakeGrid.find((b) => b.position === position);
                  return (
                    <div key={position} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{position}</span>
                      <Input value={row?.pad_measurement ?? ""} placeholder="Pad measurement" onChange={(e) => setBrakeGrid((g) => updateByPosition(g, position, { pad_measurement: e.target.value }))} />
                      <Input value={row?.adjustment_measurement ?? ""} placeholder="Adjustment measurement" onChange={(e) => setBrakeGrid((g) => updateByPosition(g, position, { adjustment_measurement: e.target.value }))} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => setBrakeGrid((g) => updateByPosition(g, position, { ok: true }))} style={pillStyle(row?.ok === true, "good")}>OK</button>
                        <button type="button" onClick={() => setBrakeGrid((g) => updateByPosition(g, position, { ok: false }))} style={pillStyle(row?.ok === false, "bad")}>Fail</button>
                      </div>
                    </div>
                  );
                })}
              </SectionCard>

              <SectionCard title="Under hood / under truck / misc" count={TRACTOR_UNDER_HOOD_TRUCK_ITEMS.length}>
                {TRACTOR_UNDER_HOOD_TRUCK_ITEMS.map((item) => (
                  <ChecklistRow key={item.key} item={item} badLabel="Fail" status={checklist.find((c) => c.key === item.key)?.status}
                    onChange={(s) => setChecklist((list) => updateByKey(list, item.key, { status: s }))} />
                ))}
              </SectionCard>

              <SectionCard title="Fifth wheel" count={TRACTOR_FIFTH_WHEEL_ITEMS.length}>
                {TRACTOR_FIFTH_WHEEL_ITEMS.map((item) => (
                  <ChecklistRow key={item.key} item={item} badLabel="Fail" status={checklist.find((c) => c.key === item.key)?.status}
                    onChange={(s) => setChecklist((list) => updateByKey(list, item.key, { status: s }))} />
                ))}
              </SectionCard>

              <SectionCard title="Certification">
                <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginBottom: 14 }}>
                  I certify the above items have been checked and are in safe operating condition in accordance to 49
                  CFR 393 and 396.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                  <Field label="Failed items repaired/replaced">
                    <Select
                      value={form.failed_items_repaired == null ? "" : form.failed_items_repaired ? "yes" : "no"}
                      onChange={(e) => set("failed_items_repaired")(e.target.value === "" ? null : e.target.value === "yes")}
                      placeholder="—" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                    />
                  </Field>
                  <Field label="Re-inspection & passed">
                    <Select
                      value={form.reinspected_and_passed == null ? "" : form.reinspected_and_passed ? "yes" : "no"}
                      onChange={(e) => set("reinspected_and_passed")(e.target.value === "" ? null : e.target.value === "yes")}
                      placeholder="—" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                    />
                  </Field>
                  <Field label="Re-inspection date"><Input type="date" value={form.reinspection_date} onChange={setInput("reinspection_date")} /></Field>
                </div>
              </SectionCard>

              <SectionCard title="Service facility">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <Field label="Name"><Input value={form.service_facility_name} onChange={setInput("service_facility_name")} /></Field>
                  <Field label="Phone"><Input value={form.service_facility_phone} onChange={setInput("service_facility_phone")} /></Field>
                </div>
                <Field label="Address"><Input value={form.service_facility_address} onChange={setInput("service_facility_address")} /></Field>
              </SectionCard>
            </>
          )}

          {isTrailer && (
            <>
              <SectionCard title="Brake system" count={TRAILER_BRAKE_SYSTEM_ITEMS.length}>
                {TRAILER_BRAKE_SYSTEM_ITEMS.map((item) => (
                  <ChecklistRow key={item.key} item={item} badLabel="Defect" status={checklist.find((c) => c.key === item.key)?.status}
                    onChange={(s) => setChecklist((list) => updateByKey(list, item.key, { status: s === "ok" ? "ok" : "defect_repaired" }))} />
                ))}
              </SectionCard>

              <SectionCard title="Inspected components / systems" count={TRAILER_CATEGORY_ITEMS.length}>
                {TRAILER_CATEGORY_ITEMS.map((item) => (
                  <ChecklistRow key={item.key} item={item} badLabel="Defect" status={checklist.find((c) => c.key === item.key)?.status}
                    onChange={(s) => setChecklist((list) => updateByKey(list, item.key, { status: s === "ok" ? "ok" : "defect_repaired" }))} />
                ))}
              </SectionCard>

              <SectionCard title="Tire tread depth">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 24px" }}>
                  {TRAILER_TIRE_POSITIONS.map((position) => {
                    const row = tireGrid.find((t) => t.position === position);
                    return (
                      <div key={position} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{position}</span>
                        <Input value={row?.value ?? ""} placeholder="32nds" style={{ width: 90 }} onChange={(e) => setTireGrid((g) => updateByPosition(g, position, { value: e.target.value }))} />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Brake lining">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 24px" }}>
                  {TRAILER_BRAKE_LINING_POSITIONS.map((position) => {
                    const row = brakeGrid.find((b) => b.position === position);
                    return (
                      <div key={position} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{position}</span>
                        <Input value={row?.pad_measurement ?? ""} placeholder="Lining measurement" style={{ width: 160 }} onChange={(e) => setBrakeGrid((g) => updateByPosition(g, position, { pad_measurement: e.target.value }))} />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Certification">
                <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginBottom: 14 }}>
                  I certify the above items have been checked and are in safe operating condition in accordance to 49
                  CFR 393 and 396.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <Field label="Failed items repaired/replaced">
                    <Select
                      value={form.failed_items_repaired == null ? "" : form.failed_items_repaired ? "yes" : "no"}
                      onChange={(e) => set("failed_items_repaired")(e.target.value === "" ? null : e.target.value === "yes")}
                      placeholder="—" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                    />
                  </Field>
                </div>
                <Field label="Defective repair/replacement details">
                  <Input value={form.defect_repair_details} onChange={setInput("defect_repair_details")} />
                </Field>
              </SectionCard>
            </>
          )}

          {unitId && (
            <SectionCard title="Mechanic sign-off">
              <Field label="Mechanic — print name" style={{ marginBottom: 10 }}>
                <Input value={form.mechanic_name} onChange={setInput("mechanic_name")} placeholder="Print name" />
              </Field>
              <Field label="Signature">
                <SignaturePad value={form.mechanic_signature_data} onChange={set("mechanic_signature_data")} />
              </Field>
            </SectionCard>
          )}

          {unitId && (
            <SectionCard title="Chargeback">
              <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12 }}>
                Flat fee of {moneyFmt(midtripFeeAmount)} for this mid-trip inspection, applied the same way
                regardless of who it's charged back to.
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--clg-text-body)", cursor: "pointer", marginBottom: isChargeback ? 12 : 0 }}>
                <input type="checkbox" checked={isChargeback} onChange={(e) => setIsChargeback(e.target.checked)} />
                Charge back to driver
              </label>
              {isChargeback && (
                <ChargebackDriverPicker
                  name={chargebackDriver}
                  onChange={(name, driverId) => { setChargebackDriver(name); setChargebackDriverId(driverId); }}
                />
              )}
            </SectionCard>
          )}
        </div>

        <div style={{ position: "sticky", top: 16 }}>
          <Card style={{ marginBottom: 16 }}>
            {totalItems > 0 && (
              <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 4 }}>
                {checkedCount} / {totalItems} items checked
              </div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 14 }}>
              {missingSignature ? "Mechanic signature outstanding" : "Signed"}
            </div>
            <Button
              onClick={() => save("filed")}
              disabled={saving || !unitId}
              iconLeft={saving ? <Loader2 size={14} className="spin" /> : null}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {saving ? "Filing…" : "File inspection"}
            </Button>
            <button
              onClick={() => save("draft")}
              disabled={saving || !unitId}
              style={{ width: "100%", background: "none", border: "none", color: "var(--clg-royal)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              Save as draft
            </button>
          </Card>

          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", lineHeight: 1.6, padding: "0 4px" }}>
            <strong style={{ color: "var(--clg-text-body)" }}>Note:</strong> this records pass/fail and sign-off only —
            it doesn't raise work orders the way the Tractor inspection does. Open a work order separately for
            anything found here that needs fixing.
          </div>
        </div>
      </div>
    </div>
  );
}
