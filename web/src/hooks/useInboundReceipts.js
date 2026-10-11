import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// The Receipt Inbox's data -- rows land here from the email-intake edge
// function (a forwarded roadside/vendor receipt), never from the frontend
// directly (inbound_receipts has no authenticated-insert RLS policy, see
// 20261011010000_inbound_receipts.sql).
export function useInboundReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("inbound_receipts")
      .select("*")
      .eq("status", "pending")
      .order("received_at", { ascending: false });
    if (err) {
      setError(err.message);
      setReceipts([]);
    } else {
      setReceipts(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id, reason) => {
    const { error: err } = await supabase.from("inbound_receipts")
      .update({ status: "dismissed", dismissed_reason: reason?.trim() || null })
      .eq("id", id);
    if (err) throw err;
    await load();
  };

  const markCreated = async (id, workOrderId) => {
    const { error: err } = await supabase.from("inbound_receipts")
      .update({ status: "created", created_work_order_id: workOrderId })
      .eq("id", id);
    if (err) throw err;
    await load();
  };

  const signedUrl = async (storagePath) => {
    const { data, error: err } = await supabase.storage.from("invoices").createSignedUrl(storagePath, 300);
    if (err) throw err;
    return data.signedUrl;
  };

  return { receipts, loading, error, reload: load, dismiss, markCreated, signedUrl };
}
