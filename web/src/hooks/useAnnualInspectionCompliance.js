import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ANNUAL_INSPECTION_INTERVAL_DAYS, nextDueDate } from "../lib/maintenanceSchedule";

// Per the Claude Design handoff (2026-09-18): this console tracks units
// that actually have a DOT annual inspection date on file, not every
// Truck/Trailer in the fleet. A unit with no date recorded is neither
// compliant nor non-compliant here -- it's unknown, and showing it as a
// red "overdue" row would claim knowledge this data doesn't have. The
// gap between this list and the fleet total is surfaced as its own
// finding (the "partial picture" rail card), not papered over with a
// fake status.
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [trackedRes, fleetRes] = await Promise.all([
      supabase
        .from("units")
        .select("id, number, type, is_active, last_annual_inspection_date, annual_inspection_notes")
        .in("type", ["Truck", "Trailer"])
        .not("last_annual_inspection_date", "is", null),
      supabase.from("units").select("id", { count: "exact", head: true }).in("type", ["Truck", "Trailer"]),
    ]);

    if (trackedRes.error) {
      setError(trackedRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    setRows(
      (trackedRes.data ?? []).map((unit) => {
        const expiration = nextDueDate(unit.last_annual_inspection_date, ANNUAL_INSPECTION_INTERVAL_DAYS);
        const daysUntilDue = Math.round((new Date(expiration + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
        return {
          ...unit,
          alvysStatus: alvysStatusFor(unit),
          expiration,
          daysUntilDue,
          band: bandFor(daysUntilDue),
          overdue: daysUntilDue < 0,
        };
      })
    );
    setFleetTotal(fleetRes.count ?? null);
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

  return { rows, fleetTotal, loading, error, reload: load, saveNotes };
}
