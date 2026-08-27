import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Alert, Eyebrow } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { CATEGORIES } from "../../lib/categories";
import StepUnit from "./StepUnit";
import StepProblem from "./StepProblem";
import StepRoute from "./StepRoute";

const STEPS = [
  { n: 1, title: "Unit", sub: "Look it up or add it" },
  { n: 2, title: "Problem", sub: "Defect, severity, evidence" },
  { n: 3, title: "Route & approve", sub: "In-house or vendor" },
];

function emptyData() {
  return {
    unitNumber: "", unitId: null, unitInfo: null, isNewUnit: false, newUnitType: "Truck",
    intakeSource: "breakdown_call", severity: "Urgent", system: CATEGORIES[0], component: "", complaint: "",
    whoFixes: "vendor", vendorName: "", assignedBay: "", assignedTech: "", estimate: "", promisedBack: "",
  };
}

export default function IntakeWizard({ onDone }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(emptyData());
  const [threshold, setThreshold] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from("app_settings").select("approval_threshold").single()
      .then(({ data: s }) => { if (s) setThreshold(Number(s.approval_threshold)); });
  }, []);

  const canContinue = step === 1 ? !!data.unitId : step === 2 ? !!data.complaint.trim() : true;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let vendorId = null;
      if (data.whoFixes === "vendor" && data.vendorName.trim()) {
        const { data: existingVendor } = await supabase.from("vendors").select("id").ilike("name", data.vendorName.trim()).maybeSingle();
        if (existingVendor) {
          vendorId = existingVendor.id;
        } else {
          const { data: newVendor, error: vErr } = await supabase.from("vendors")
            .insert({ name: data.vendorName.trim(), specialty_category: data.system }).select("id").single();
          if (vErr) throw vErr;
          vendorId = newVendor.id;
        }
      }

      const estimate = Number(data.estimate) || 0;
      const approvalStatus = estimate > threshold ? "needs_approval" : "not_required";

      const { error: insertErr } = await supabase.from("work_orders").insert({
        unit_id: data.unitId,
        vendor_id: vendorId,
        category: data.system,
        system_component: data.component || null,
        complaint: data.complaint || null,
        severity: data.severity,
        intake_source: data.intakeSource,
        cost: estimate,
        status: "Open",
        date_opened: new Date().toISOString().slice(0, 10),
        promised_back: data.promisedBack || null,
        assigned_bay: data.whoFixes === "inhouse" ? data.assignedBay || null : null,
        assigned_tech: data.whoFixes === "inhouse" ? data.assignedTech || null : null,
        approval_status: approvalStatus,
        source: "manual",
      });
      if (insertErr) throw insertErr;

      if (data.severity === "Unit down") {
        await supabase.from("units").update({ can_move_load: false, idle_since: new Date().toISOString() }).eq("id", data.unitId);
      }

      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: "#fff", fontFamily: "var(--clg-font-body)", color: "var(--clg-granite)", maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: "1px solid var(--clg-smoke)" }}>
        <div>
          <Eyebrow tone="muted" style={{ fontSize: 10 }}>New work order</Eyebrow>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontSize: 22, color: "var(--clg-navy)", marginTop: 4 }}>
            Step {step} of 3 — {STEPS[step - 1].title === "Unit" ? "Find the unit" : STEPS[step - 1].title === "Problem" ? "Describe the problem" : "Route it"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="outline" size="md" onClick={onDone}>Cancel</Button>
        </div>
      </div>

      <div style={{ display: "flex", padding: "20px 32px", borderBottom: "1px solid var(--clg-smoke)", background: "#F7FAFC" }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, opacity: s.n === step ? 1 : s.n < step ? 0.75 : 0.5 }}>
            <div style={{
              width: 22, height: 22, fontSize: 11, display: "grid", placeItems: "center", flexShrink: 0,
              background: s.n < step ? "var(--clg-royal)" : s.n === step ? "var(--clg-scarlet)" : "transparent",
              color: s.n <= step ? "#fff" : "var(--clg-cool)",
              border: s.n > step ? "1px solid var(--clg-mercury)" : "none",
            }}>
              {s.n < step ? <Check size={12} /> : s.n}
            </div>
            <div>
              <div style={{ fontSize: 12.5, color: "var(--clg-navy)", fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--clg-cool)" }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <div style={{ padding: "12px 32px 0" }}><Alert tone="critical">{error}</Alert></div>}

      {step === 1 && <StepUnit data={data} setData={setData} />}
      {step === 2 && <StepProblem data={data} setData={setData} />}
      {step === 3 && <StepRoute data={data} setData={setData} approvalThreshold={threshold} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderTop: "1px solid var(--clg-reflection)" }}>
        <div style={{ fontSize: 12, color: "var(--clg-cool)" }}>
          {step === 3 && data.severity === "Unit down" && (
            <>Unit {data.unitInfo?.number} will show <strong style={{ color: "var(--clg-ruby)" }}>Out of service</strong></>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {step > 1 && <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 3 ? (
            <Button size="lg" onClick={() => setStep(step + 1)} disabled={!canContinue}>Continue</Button>
          ) : (
            <Button size="lg" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 size={16} className="spin" /> : null}
              Create work order
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
