import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const FIELD_LABELS = {
  driver_name: "Driver",
  eligibility: "Eligibility",
  unavailable_reason: "Unavailable Reason",
  start_date: "Start Date",
  end_date: "End Date",
  approval: "Approval",
  effective_date: "Effective Date",
};

const EDITABLE_FIELDS = Object.keys(FIELD_LABELS);

export function useRoster() {
  const [rows, setRows] = useState([]);
  const [changeLog, setChangeLog] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rosterRes, logRes, settingsRes] = await Promise.all([
      supabase.from("driver_roster").select("*").order("driver_name", { ascending: true }),
      supabase.from("roster_change_log").select("*").order("changed_at", { ascending: false }).limit(100),
      supabase.from("roster_settings").select("*").eq("id", true).single(),
    ]);
    if (rosterRes.error) {
      setError(rosterRes.error.message);
      setRows([]);
    } else {
      setRows(rosterRes.data ?? []);
    }
    if (!logRes.error) setChangeLog(logRes.data ?? []);
    if (!settingsRes.error) setSettings(settingsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Inserts or updates a roster row, then writes one change-log entry per
  // changed field (or one "(new record)" / "(record removed)" entry) —
  // mirrors the governed sheet's "every change gets logged" requirement.
  const saveRow = async (existingRow, patch, { changedBy, reason }) => {
    if (!changedBy?.trim() || !reason?.trim()) throw new Error("Changed by and reason are required.");

    if (!existingRow) {
      const { data: created, error: insertErr } = await supabase.from("driver_roster").insert(patch).select().single();
      if (insertErr) throw insertErr;
      const { error: logErr } = await supabase.from("roster_change_log").insert({
        changed_by: changedBy.trim(),
        driver_affected: created.driver_name,
        field_changed: "(new record)",
        old_value: null,
        new_value: created.driver_name,
        reason: reason.trim(),
      });
      if (logErr) throw logErr;
      await load();
      return created;
    }

    const logEntries = [];
    for (const field of EDITABLE_FIELDS) {
      const oldVal = existingRow[field] ?? null;
      const newVal = patch[field] ?? null;
      if (oldVal !== newVal) {
        logEntries.push({
          changed_by: changedBy.trim(),
          driver_affected: patch.driver_name || existingRow.driver_name,
          field_changed: FIELD_LABELS[field],
          old_value: oldVal != null ? String(oldVal) : null,
          new_value: newVal != null ? String(newVal) : null,
          reason: reason.trim(),
        });
      }
    }
    if (logEntries.length === 0) return existingRow; // nothing actually changed

    const { data: updated, error: updateErr } = await supabase
      .from("driver_roster").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existingRow.id).select().single();
    if (updateErr) throw updateErr;

    const { error: logErr } = await supabase.from("roster_change_log").insert(logEntries);
    if (logErr) throw logErr;

    await load();
    return updated;
  };

  const deleteRow = async (row, { changedBy, reason }) => {
    if (!changedBy?.trim() || !reason?.trim()) throw new Error("Changed by and reason are required.");
    const { error: deleteErr } = await supabase.from("driver_roster").delete().eq("id", row.id);
    if (deleteErr) throw deleteErr;
    const { error: logErr } = await supabase.from("roster_change_log").insert({
      changed_by: changedBy.trim(),
      driver_affected: row.driver_name,
      field_changed: "(record removed)",
      old_value: row.driver_name,
      new_value: null,
      reason: reason.trim(),
    });
    if (logErr) throw logErr;
    await load();
  };

  const updateSettings = async (fields) => {
    const { error: err } = await supabase.from("roster_settings").update(fields).eq("id", true);
    if (!err) await load();
    return err;
  };

  return { rows, changeLog, settings, loading, error, reload: load, saveRow, deleteRow, updateSettings };
}
