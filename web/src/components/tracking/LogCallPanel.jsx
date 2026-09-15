import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button, Field, Input, Select, Alert, Toggle, Eyebrow } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { CATEGORIES } from "../../lib/categories";

function currentHourIso() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

// Slide-over used both for the routine "log this hour's call" action and
// (via initialOffDuty) the board's "Mark off duty" quick action -- same
// form either way, just pre-checked.
export default function LogCallPanel({ board, loggedByName, initialOffDuty = false, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [setsFreeTime, setSetsFreeTime] = useState(false);
  const [freeTimeAt, setFreeTimeAt] = useState("");
  const [offDuty, setOffDuty] = useState(initialOffDuty);
  const [flagsDefect, setFlagsDefect] = useState(false);
  const [defectCategory, setDefectCategory] = useState(CATEGORIES[0]);
  const [defectDescription, setDefectDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (offDuty) {
      // Off duty needs no note about a call that didn't happen.
    } else if (!note.trim()) {
      setError("Enter what the driver said, or mark them off duty instead.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let freeTimeIso = null;
      if (setsFreeTime && freeTimeAt) {
        const [h, m] = freeTimeAt.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        freeTimeIso = d.toISOString();
      }

      const { data: callRow, error: callErr } = await supabase
        .from("check_calls")
        .insert({
          unit_id: board.unitId,
          unit_number: board.unitNumber,
          driver_id: board.driverId,
          driver_name: board.driverName,
          alvys_trip_id: board.alvysTripId,
          load_number: board.loadNumber,
          call_hour: currentHourIso(),
          logged_by: loggedByName,
          note: offDuty ? (note.trim() || "Marked off duty") : note.trim(),
          free_time_expires_at: freeTimeIso,
          off_duty: offDuty,
        })
        .select("id")
        .single();
      if (callErr) throw callErr;

      if (flagsDefect && defectDescription.trim()) {
        const { error: woErr } = await supabase.from("work_orders").insert({
          unit_id: board.unitId,
          category: defectCategory,
          complaint: defectDescription.trim(),
          severity: "Routine",
          status: "Open-Proposed",
          intake_source: "manual",
          source: "manual",
          date_opened: new Date().toISOString().slice(0, 10),
          check_call_id: callRow.id,
        });
        if (woErr) throw woErr;
      }

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, .45)", zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--clg-surface-card)", width: "100%", maxWidth: 440, height: "100%",
        boxShadow: "var(--clg-shadow-lg, -12px 0 40px rgba(0,0,0,.2))", overflow: "auto", padding: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <Eyebrow tone="brand">{offDuty ? "Mark off duty" : "Log a call"}</Eyebrow>
            <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>{board.driverName}</h2>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
              Truck {board.unitNumber || "—"}{board.loadNumber ? ` · Load ${board.loadNumber}` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {error && <Alert tone="critical" style={{ marginTop: 16 }}>{error}</Alert>}

        <form onSubmit={onSubmit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Toggle checked={offDuty} onChange={setOffDuty} label="Off duty for the rest of today — stop flagging missed hours" />

          <Field label={offDuty ? "Note (optional)" : "What did the driver say"} required={!offDuty} help="This becomes one entry in the driver's call thread for today.">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={offDuty ? "e.g. Home time, back on 09/17" : "e.g. Still on the dock, detention starts 12:48 if not loaded"}
              style={{
                width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: "var(--clg-size-body)",
                border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)", padding: "11px 12px", resize: "vertical",
              }}
            />
          </Field>

          {!offDuty && (
            <>
              <Toggle checked={setsFreeTime} onChange={setSetsFreeTime} label="Set a free-time / detention clock" />
              {setsFreeTime && (
                <Field label="Free time expires at" help="Detention starts once this passes without a load status change.">
                  <Input type="time" value={freeTimeAt} onChange={(e) => setFreeTimeAt(e.target.value)} />
                </Field>
              )}

              <Toggle checked={flagsDefect} onChange={setFlagsDefect} label="Driver reported a defect — raise a work order" />
              {flagsDefect && (
                <div style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="Category">
                    <Select value={defectCategory} onChange={(e) => setDefectCategory(e.target.value)} options={CATEGORIES} />
                  </Field>
                  <Field label="What's wrong" required={flagsDefect}>
                    <Input value={defectDescription} onChange={(e) => setDefectDescription(e.target.value)} placeholder="e.g. Blown tag light on trailer" />
                  </Field>
                  <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
                    Opens a proposed work order on unit {board.unitNumber || "—"}, linked back to this call.
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting} iconLeft={submitting ? <Loader2 size={14} className="spin" /> : null}>
              {offDuty ? "Mark off duty" : "Log call"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
