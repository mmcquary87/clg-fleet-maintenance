import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const DOC_SELECT = "id, work_order_id, storage_path, file_name, note, created_at";
const SIGNED_URL_TTL_SECONDS = 300;

// Multiple files per work order -- same private-bucket + child-table
// pattern as useUnitDocuments.js, against the existing `invoices` bucket
// instead of a new one (see 20260918130000_work_order_documents.sql for
// why this replaced the old single work_orders.receipt_path column).
export function useWorkOrderDocuments(workOrderId) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!workOrderId) { setDocuments([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("work_order_documents").select(DOC_SELECT)
      .eq("work_order_id", workOrderId).order("created_at", { ascending: false });
    if (err) { setError(err.message); setDocuments([]); } else { setDocuments(data ?? []); }
    setLoading(false);
  }, [workOrderId]);

  useEffect(() => { load(); }, [load]);

  const upload = async ({ file, note }) => {
    const path = `${workOrderId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("invoices").upload(path, file);
    if (uploadErr) return uploadErr;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase.from("work_order_documents").insert({
      work_order_id: workOrderId, storage_path: path, file_name: file.name,
      note: note || null, uploaded_by: user?.id ?? null,
    });
    if (!insertErr) await load();
    return insertErr;
  };

  const remove = async (doc) => {
    await supabase.storage.from("invoices").remove([doc.storage_path]);
    const { error: err } = await supabase.from("work_order_documents").delete().eq("id", doc.id);
    if (!err) await load();
    return err;
  };

  const signedUrlFor = async (doc) => {
    const { data, error: err } = await supabase.storage.from("invoices")
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    if (err) return null;
    return data?.signedUrl ?? null;
  };

  return { documents, loading, error, reload: load, upload, remove, signedUrlFor };
}
