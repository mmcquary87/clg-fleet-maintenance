import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { describeCadence } from "../lib/homeTimeSchedule";

const FIELD_LABELS = {
  driver_name: "Driver",
  cadence: "Cadence",
  days_of_week: "Days of week",
  anchor_date: "Anchor date",
  month_occurrence: "Month occurrence",
  effective_start_date: "Effective start",
  effective_end_date: "Effective end",
  approval: "Approval",
  notes: "Notes",
};

const EDITABLE_FIELDS = Object.keys(FIELD_LABELS);

function fieldValueStr(field, value) {
  if (value == null) return null;
  if (field === "days_of_week") return Array.isArray(value) ? value.join(",") : String(value);
  return String(value);
}

export function useHomeTime() {
  const [rows, setRows] = useState([]);
  const [changeLog, setChangeLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rowsRes, logRes] = await Promise.all([
      supabase.from("planned_home_time").select("*").order("driver_name", { ascending: true }),
      supabase.from("roster_change_log").select("*").eq("domain", "home_time").order("changed_at", { ascending: false }).limit(100),
    ]);
    if (rowsRes.error) {
      setError(rowsRes.error.message);
      setRows([]);
    } else {
      setRows(rowsRes.data ?? []);
    }
    if (!logRes.error) setChangeLog(logRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveRow = async (existingRow, patch, { changedBy, reason }) => {
    if (!changedBy?.trim() || !reason?.trim()) throw new Error("Changed by and reason are required.");

    if (!existingRow) {
      const { data: created, error: insertErr } = await supabase.from("planned_home_time").insert(patch).select().single();
      if (insertErr) throw insertErr;
      const { error: logErr } = await supabase.from("roster_change_log").insert({
        domain: "home_time",
        changed_by: changedBy.trim(),
        driver_affected: created.driver_name,
        field_changed: "(new schedule)",
        old_value: null,
        new_value: `${created.driver_name} — ${describeCadence(created)}`,
        reason: reason.trim(),
      });
      if (logErr) throw logErr;
      await load();
      return created;
    }

    const logEntries = [];
    for (const field of EDITABLE_FIELDS) {
      const oldVal = fieldValueStr(field, existingRow[field]);
      const newVal = fieldValueStr(field, patch[field]);
      if (oldVal !== newVal) {
        logEntries.push({
          domain: "home_time",
          changed_by: changedBy.trim(),
          driver_affected: patch.driver_name || existingRow.driver_name,
          field_changed: FIELD_LABELS[field],
          old_value: oldVal,
          new_value: newVal,
          reason: reason.trim(),
        });
      }
    }
    if (logEntries.length === 0) return existingRow;

    const { data: updated, error: updateErr } = await supabase
      .from("planned_home_time").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existingRow.id).select().single();
    if (updateErr) throw updateErr;

    const { error: logErr } = await supabase.from("roster_change_log").insert(logEntries);
    if (logErr) throw logErr;

    await load();
    return updated;
  };

  const deleteRow = async (row, { changedBy, reason }) => {
    if (!changedBy?.trim() || !reason?.trim()) throw new Error("Changed by and reason are required.");
    const { error: deleteErr } = await supabase.from("planned_home_time").delete().eq("id", row.id);
    if (deleteErr) throw deleteErr;
    const { error: logErr } = await supabase.from("roster_change_log").insert({
      domain: "home_time",
      changed_by: changedBy.trim(),
      driver_affected: row.driver_name,
      field_changed: "(schedule removed)",
      old_value: `${row.driver_name} — ${describeCadence(row)}`,
      new_value: null,
      reason: reason.trim(),
    });
    if (logErr) throw logErr;
    await load();
  };

  return { rows, changeLog, loading, error, reload: load, saveRow, deleteRow };
}
