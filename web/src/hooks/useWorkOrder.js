import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const FULL_SELECT = `
  id, wo_number, category, severity, system_component, description, complaint, cost, status,
  approval_status, approved_by, approved_at, date_opened, date_closed, invoice_ref,
  po_number, intake_source, assigned_bay, assigned_tech, waiting_on_parts, parts_eta,
  promised_back, warranty_recovery_amount, receipt_path, source, samsara_reference_id,
  alvys_maintenance_id, created_at, updated_at, is_chargeback, chargeback_driver_name,
  voided, voided_at, voided_reason, labor_hours,
  unit:units(id, number, type, vin, driver_name, current_location),
  vendor:vendors(id, name, contact_name, contact_email),
  parts:work_order_parts(id, part_name, quantity, unit_cost, created_at)
`;

// Fetches one work order with every column (the list views only pull a
// subset), plus a signed URL for the receipt if one's attached.
export function useWorkOrder(id) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState(null);

  const load = useCallback(async () => {
    if (!id) { setOrder(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("work_orders").select(FULL_SELECT).eq("id", id).single();
    if (err) {
      setError(err.message);
      setOrder(null);
    } else {
      // Embedded selects don't guarantee row order -- sort parts oldest
      // first so the list reads the order they were logged in.
      setOrder({ ...data, parts: [...(data.parts ?? [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) });
      if (data.receipt_path) {
        const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(data.receipt_path, 300);
        setReceiptUrl(signed?.signedUrl ?? null);
      } else {
        setReceiptUrl(null);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { order, loading, error, receiptUrl, reload: load };
}
