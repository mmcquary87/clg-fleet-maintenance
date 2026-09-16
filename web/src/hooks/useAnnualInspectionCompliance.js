import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ANNUAL_INSPECTION_INTERVAL_DAYS, DUE_SOON_WINDOW_DAYS, nextDueDate } from "../lib/maintenanceSchedule";

// A unit with no last_annual_inspection_date on file gets treated as the
// worst case (red, sorted first) rather than "unknown" -- for a DOT
// annual inspection specifically, "we don't know when this was last
// done" is itself the compliance risk this console exists to surface,
// not a neutral gap to soft-pedal.
const RED_WINDOW_DAYS = DUE_SOON_WINDOW_DAYS; // < 14 days (or overdue, or no date on file)
const YELLOW_WINDOW_DAYS = 29; // 14-29 days

function bandFor(daysUntilDue) {
  if (daysUntilDue == null || daysUntilDue < RED_WINDOW_DAYS) return "red";
  if (daysUntilDue <= YELLOW_WINDOW_DAYS) return "yellow";
  return "green";
}

// Alvys sync (alvys-sync-equipment) only ever pulls active equipment --
// there's no richer Repair/Crashed status flowing into `units` today, so
// this only distinguishes Active/Inactive off the existing `is_active`
// flag. Extending the sync to pull Alvys's fuller status range is a
// separate, bigger change (would start surfacing units that don't exist
// in this table today) -- out of scope here.
function alvysStatusFor(unit) {
  return unit.is_active ? "Active" : "Inactive";
}

export function useAnnualInspectionCompliance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("units")
      .select("id, number, type, is_active, last_annual_inspection_date, annual_inspection_notes")
      .in("type", ["Truck", "Trailer"]);

    if (err) {
      setError(err.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    setRows(
      (data ?? []).map((unit) => {
        const expiration = nextDueDate(unit.last_annual_inspection_date, ANNUAL_INSPECTION_INTERVAL_DAYS);
        const daysUntilDue = expiration
          ? Math.round((new Date(expiration + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000)
          : null;
        return {
          ...unit,
          alvysStatus: alvysStatusFor(unit),
          expiration,
          daysUntilDue,
          band: bandFor(daysUntilDue),
        };
      })
    );
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

  return { rows, loading, error, reload: load, saveNotes };
}
