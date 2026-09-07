import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const CHECKIN_SELECT = "id, unit_id, event_type, driver_name, occurred_at, odometer, fuel_percent, condition_notes, created_at";

// A dispatcher/mechanic-logged event each time a driver drops off or picks
// up a unit — odometer/fuel/condition captured at that moment, plus any
// photos taken (unit_documents rows with doc_type = 'checkin_photo' and
// checkin_id set). See 20260907040000_unit_documents_and_checkins.sql.
export function useUnitCheckins(unitId) {
  const [checkins, setCheckins] = useState([]);
  const [photosByCheckin, setPhotosByCheckin] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) { setCheckins([]); setPhotosByCheckin({}); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("unit_checkins").select(CHECKIN_SELECT)
      .eq("unit_id", unitId).order("occurred_at", { ascending: false });
    if (err) { setError(err.message); setCheckins([]); setLoading(false); return; }
    const rows = data ?? [];
    setCheckins(rows);
    if (rows.length > 0) {
      const { data: photoRows } = await supabase.from("unit_documents")
        .select("id, checkin_id, storage_path, file_name")
        .in("checkin_id", rows.map((r) => r.id));
      const grouped = {};
      for (const p of photoRows ?? []) {
        (grouped[p.checkin_id] ??= []).push(p);
      }
      setPhotosByCheckin(grouped);
    } else {
      setPhotosByCheckin({});
    }
    setLoading(false);
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const logEvent = async ({ eventType, driverName, occurredAt, odometer, fuelPercent, conditionNotes, photos }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error: insertErr } = await supabase.from("unit_checkins").insert({
      unit_id: unitId, event_type: eventType, driver_name: driverName || null,
      occurred_at: occurredAt || new Date().toISOString(),
      odometer: odometer === "" || odometer == null ? null : Number(odometer),
      fuel_percent: fuelPercent === "" || fuelPercent == null ? null : Number(fuelPercent),
      condition_notes: conditionNotes || null, logged_by: user?.id ?? null,
    }).select("id").single();
    if (insertErr) return insertErr;

    for (const file of photos ?? []) {
      const path = `${unitId}/checkins/${inserted.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("unit-documents").upload(path, file);
      if (!uploadErr) {
        await supabase.from("unit_documents").insert({
          unit_id: unitId, checkin_id: inserted.id, doc_type: "checkin_photo",
          storage_path: path, file_name: file.name, uploaded_by: user?.id ?? null,
        });
      }
    }
    await load();
    return null;
  };

  const signedUrlFor = async (photo) => {
    const { data, error: err } = await supabase.storage.from("unit-documents")
      .createSignedUrl(photo.storage_path, 300);
    if (err) return null;
    return data?.signedUrl ?? null;
  };

  return { checkins, photosByCheckin, loading, error, reload: load, logEvent, signedUrlFor };
}
