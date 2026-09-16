import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
// 'dot_inspection', basis = 'alvys_certificate') -- alvys-sync-dot-
// inspections parses the real expiration date straight off each unit's
// uploaded DOT inspection certificate in Alvys, so this is the actual
// due date, not an estimate from units.last_annual_inspection_date +
// a fixed interval. That sync has only been run once (2026-09-01,
// before the fleet grew to its current size) and isn't scheduled --
// re-running it periodically would pick up units added since and any
// units that previously hit a rate-limit error.
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
        .select("due_date, unit:units(id, number, type, is_active, annual_inspection_notes)")
        .eq("kind", "dot_inspection")
        .eq("basis", "alvys_certificate"),
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
          const daysUntilDue = Math.round((new Date(r.due_date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
          return {
            ...unit,
            alvysStatus: alvysStatusFor(unit),
            expiration: r.due_date,
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
