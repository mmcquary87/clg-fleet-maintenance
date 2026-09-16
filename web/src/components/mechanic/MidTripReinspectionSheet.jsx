import { useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Badge, Button, Field, Input, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Follow-up screen for a mid-trip inspection that failed something and
// hasn't been cleared yet (see useFailedMidTripInspections). Doesn't
// re-run the whole checklist -- that already happened when the
// inspection was filed -- this just records that the flagged items got
// fixed and the unit was re-checked, using the same failed_items_repaired/
// reinspected_and_passed/reinspection_date fields the filing form itself
// exposes (its own certification box asks the same three questions).
export default function MidTripReinspectionSheet({ inspection, onBack, onResolved }) {
  const [reinspectionDate, setReinspectionDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const failedItems = (inspection.checklist ?? []).filter((i) => i.status && i.status !== "ok");
  const isTractor = inspection.unit_type !== "Trailer";

  const markPassed = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates = {
        failed_items_repaired: true,
        reinspected_and_passed: true,
        reinspection_date: reinspectionDate || null,
      };
      if (isTractor) updates.overall_result = "Pass";
      const { error: err } = await supabase.from("mid_trip_inspections").update(updates).eq("id", inspection.id);
      if (err) throw err;
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", marginBottom: 16, fontSize: 13 }}>
        <ChevronLeft size={16} /> Back to failed mid-trips
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)" }}>
          Unit {inspection.unit?.number ?? "—"}
        </div>
        <Badge tone="critical">{inspection.overall_result === "Fail" ? "Fail" : "Defect found"}</Badge>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 20 }}>
        Filed {inspection.inspected_at} by {inspection.mechanic_name || "—"}
      </div>

      {error && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-brand)", marginBottom: 8 }}>
        Flagged at filing
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
        {failedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No individual checklist items were flagged — overall result was Fail.</div>
        ) : (
          failedItems.map((i) => (
            <div key={i.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
              <span style={{ fontSize: 13.5, color: "var(--clg-text-body)" }}>{i.label}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {i.note && <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>{i.note}</span>}
                <Badge tone={statusTone(i.status)}>{statusLabel(i.status)}</Badge>
              </span>
            </div>
          ))
        )}
      </div>

      {inspection.defect_repair_details && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-brand)", marginBottom: 6 }}>
            Defect repair details on file
          </div>
          <div style={{ fontSize: 13, color: "var(--clg-text-body)" }}>{inspection.defect_repair_details}</div>
        </div>
      )}

      <div style={{ border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-md)", padding: 16 }}>
        <div style={{ fontSize: 13.5, color: "var(--clg-text-body)", marginBottom: 14 }}>
          Confirm the flagged item(s) have been repaired and the unit re-inspected before moving this to Passed.
        </div>
        <Field label="Re-inspection date" style={{ marginBottom: 14 }}>
          <Input type="date" value={reinspectionDate} onChange={(e) => setReinspectionDate(e.target.value)} />
        </Field>
        <Button
          onClick={markPassed}
          disabled={saving}
          iconLeft={saving ? <Loader2 size={14} className="spin" /> : null}
          style={{ width: "100%" }}
        >
          {saving ? "Saving…" : "Mark repaired & passed"}
        </Button>
      </div>
    </div>
  );
}
