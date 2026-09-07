import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const DOC_SELECT = "id, unit_id, checkin_id, doc_type, storage_path, file_name, note, created_at";
const SIGNED_URL_TTL_SECONDS = 300;

export const UNIT_DOC_TYPES = [
  { value: "photo", label: "Unit photo" },
  { value: "registration", label: "Registration" },
  { value: "title", label: "Title" },
  { value: "insurance_card", label: "Insurance card" },
  { value: "lease_agreement", label: "Lease agreement" },
  { value: "other", label: "Other" },
];

// Documents/photos attached directly to a unit (not via a check-in event
// -- see useUnitCheckins for those). Same private-bucket + signed-URL
// pattern as work_orders' receipt_path (the only other file-storage
// pattern in the app), just against the unit-documents bucket instead of
// invoices (20260907040000_unit_documents_and_checkins.sql).
export function useUnitDocuments(unitId) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) { setDocuments([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("unit_documents").select(DOC_SELECT)
      .eq("unit_id", unitId).is("checkin_id", null).order("created_at", { ascending: false });
    if (err) { setError(err.message); setDocuments([]); } else { setDocuments(data ?? []); }
    setLoading(false);
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const upload = async ({ file, docType, note }) => {
    const path = `${unitId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("unit-documents").upload(path, file);
    if (uploadErr) return uploadErr;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase.from("unit_documents").insert({
      unit_id: unitId, doc_type: docType, storage_path: path, file_name: file.name,
      note: note || null, uploaded_by: user?.id ?? null,
    });
    if (!insertErr) await load();
    return insertErr;
  };

  const remove = async (doc) => {
    await supabase.storage.from("unit-documents").remove([doc.storage_path]);
    const { error: err } = await supabase.from("unit_documents").delete().eq("id", doc.id);
    if (!err) await load();
    return err;
  };

  const signedUrlFor = async (doc) => {
    const { data, error: err } = await supabase.storage.from("unit-documents")
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    if (err) return null;
    return data?.signedUrl ?? null;
  };

  return { documents, loading, error, reload: load, upload, remove, signedUrlFor };
}
