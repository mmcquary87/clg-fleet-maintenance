import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { nextDueDate, ANNUAL_INSPECTION_INTERVAL_DAYS } from "../lib/maintenanceSchedule";

// Per the Claude Design handoff (2026-09-18): this console tracks units
// that actually have a DOT annual inspection date on file, not every
// Truck/Trailer in the fleet. A unit with no date recorded is neither
// compliant nor non-compliant here -- it's unknown, and showing it as a
// red "overdue" row would claim knowledge this data doesn't have. The
// gap between this list and the fleet total is surfaced as its own
// finding (the "partial picture" rail card), not papered over with a
// fake status.
//
// The expiration date itself comes from unit_maintenance_due (kind =
// 'dot_inspection'). basis = 'alvys_field' is the current, authoritative
// source -- alvys-sync-equipment reads InspectionExpirationDate (trucks) /
// InspectionExpiresAt (trailers) directly off Alvys's own truck/trailer
// record, the same search response it already fetches every 6 hours.
// basis = 'alvys_certificate' is the older, now-superseded source
// (alvys-sync-dot-inspections parsed a date out of an uploaded
// document's free-text label instead) -- kept in this filter only so
// rows haven't yet been overwritten by an equipment sync still show
// something rather than nothing; confirmed less reliable (034003 showed
// 2026-09-23 from a certificate parse when Alvys's own field says
// 2027-09-09) and will disappear entirely once every unit has synced
// under the new basis.
const RED_WINDOW_DAYS = 14; // overdue or < 14 days
const YELLOW_WINDOW_DAYS = 29; // 14-29 days

function bandFor(daysUntilDue) {
  if (daysUntilDue < RED_WINDOW_DAYS) return "red";
  if (daysUntilDue <= YELLOW_WINDOW_DAYS) return "yellow";
  return "green";
}

// Alvys sync (alvys-sync-equipment) only ever pulls active equipment --
// there's no richer Repair/Crashed status flowing into `units` today, so
// this only distinguishes Active/Inactive off the existing `is_active`
// flag. The design calls for a 4-state Active/Inactive/Repair/Crashed
// status; extending the sync to pull Alvys's fuller status range would
// mean it starts surfacing units it currently filters out entirely --
// a separate, bigger change, not something to fake with invented states.
function alvysStatusFor(unit) {
  return unit.is_active ? "Active" : "Inactive";
}

export function useAnnualInspectionCompliance() {
  const [rows, setRows] = useState([]);
  const [fleetTotal, setFleetTotal] = useState(null);
  const [noDocumentCount, setNoDocumentCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dueRes, fleetRes, noDocRes] = await Promise.all([
      supabase
        .from("unit_maintenance_due")
        .select("due_date, unit:units(id, number, type, is_active, annual_inspection_notes, current_location, last_annual_inspection_date)")
        .eq("kind", "dot_inspection")
        .in("basis", ["alvys_field", "alvys_certificate"]),
      supabase.from("units").select("id", { count: "exact", head: true }).in("type", ["Truck", "Trailer"]),
      supabase.from("unit_maintenance_due").select("id", { count: "exact", head: true }).eq("kind", "dot_inspection").eq("basis", "no_document_on_file"),
    ]);

    if (dueRes.error) {
      setError(dueRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    setRows(
      (dueRes.data ?? [])
        .filter((r) => r.unit && ["Truck", "Trailer"].includes(r.unit.type))
        .map((r) => {
          const unit = r.unit;
          // A manually-logged "Last done" date (Unit page's Service tab)
          // is more current than Alvys's own synced record whenever it
          // computes a LATER expiration -- a real inspection can only push
          // the due date forward, so whichever source gives the further-
          // out date is the freshest one, regardless of which system
          // recorded it. Otherwise this console silently ignored a manual
          // update entirely until Alvys's own record caught up on its next
          // sync, showing a unit as overdue when it had already been
          // reinspected and logged here.
          const manualDue = nextDueDate(unit.last_annual_inspection_date, ANNUAL_INSPECTION_INTERVAL_DAYS);
          const dueDate = manualDue && manualDue > r.due_date ? manualDue : r.due_date;
          const daysUntilDue = Math.round((new Date(dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
          return {
            ...unit,
            alvysStatus: alvysStatusFor(unit),
            expiration: dueDate,
            daysUntilDue,
            band: bandFor(daysUntilDue),
            overdue: daysUntilDue < 0,
          };
        })
    );
    setFleetTotal(fleetRes.count ?? null);
    setNoDocumentCount(noDocRes.count ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveNotes = async (unitId, notes) => {
    const { error: err } = await supabase.from("units").update({ annual_inspection_notes: notes }).eq("id", unitId);
    if (err) throw err;
    setRows((rs) => rs.map((r) => (r.id === unitId ? { ...r, annual_inspection_notes: notes } : r)));
  };

  return { rows, fleetTotal, noDocumentCount, loading, error, reload: load, saveNotes };
}
