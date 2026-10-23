import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } | null (null = all time)
// Owner-operators are billed a flat amount per chargeback regardless of the
// unit's ownership or the repair's actual cost (CLG bills an owner-operator
// for damage to company equipment too, not just their own truck) -- see
// 20260911010000_owner_operator_chargeback_amount.sql. Company drivers are
// still charged back at actual cost, same as before that setting existed.
//
// Chargebacks now come from two places: a plain single-category work order
// (is_chargeback set directly on work_orders, the common case) AND a
// chargeback-flagged line item within a multi-category invoice
// (work_order_line_items.is_chargeback -- not every category on one
// invoice is necessarily chargeback-eligible). Both are normalized to the
// same record shape here so DeductionsView doesn't need to know which one
// it's looking at; _source tracks which table setDeducted should write to.
const WO_CHARGEBACK_SELECT =
  "id, chargeback_driver_name, chargeback_driver_id, chargeback_deducted_at, category, description, complaint, cost, date_opened, date_closed, " +
  "invoice_ref, po_number, mid_trip_inspection_id, unit:units(number), vendor:vendors(name), driver:drivers(driver_type)";

const LINE_ITEM_CHARGEBACK_SELECT =
  "id, chargeback_driver_name, chargeback_driver_id, chargeback_deducted_at, category, description, cost, " +
  "work_order:work_orders!inner(id, wo_number, date_opened, date_closed, invoice_ref, po_number, voided, mid_trip_inspection_id, unit:units(number), vendor:vendors(name)), " +
  "driver:drivers(driver_type)";

function billedAmountFor(r, flatAmount) {
  const isOwnerOperator = r.driver?.driver_type === "OWNER_OPERATOR";
  // The mid-trip inspection fee is a flat rate applied uniformly regardless
  // of who's being charged (CLG, 2026-09-18) -- its own cost IS that flat
  // rate already, so it must never be swapped out for the owner-operator-
  // specific rate below.
  const isMidTripFee = r.mid_trip_inspection_id != null;
  const flatRateApplied = !isMidTripFee && isOwnerOperator && flatAmount != null;
  const billedAmount = flatRateApplied ? Number(flatAmount) : Number(r.cost) || 0;
  return { isOwnerOperator, flatRateApplied, billedAmount };
}

export function useDeductions(range) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let woQuery = supabase.from("work_orders").select(WO_CHARGEBACK_SELECT)
      .eq("is_chargeback", true).eq("voided", false);
    if (range?.start) woQuery = woQuery.gte("date_opened", range.start);
    if (range?.end) woQuery = woQuery.lte("date_opened", range.end);

    let liQuery = supabase.from("work_order_line_items").select(LINE_ITEM_CHARGEBACK_SELECT)
      .eq("is_chargeback", true).eq("work_order.voided", false);
    if (range?.start) liQuery = liQuery.gte("work_order.date_opened", range.start);
    if (range?.end) liQuery = liQuery.lte("work_order.date_opened", range.end);

    const [settingsRes, woRes, liRes] = await Promise.all([
      supabase.from("app_settings").select("owner_operator_chargeback_amount").single(),
      woQuery,
      liQuery,
    ]);

    if (woRes.error || liRes.error) {
      setError(woRes.error?.message || liRes.error?.message);
      setRecords([]);
      setLoading(false);
      return;
    }

    const flatAmount = settingsRes.data?.owner_operator_chargeback_amount;

    const fromWorkOrders = (woRes.data ?? []).map((r) => ({
      ...r, ...billedAmountFor(r, flatAmount), _source: "work_order",
    }));

    const fromLineItems = (liRes.data ?? []).map((li) => {
      const normalized = {
        id: li.id,
        chargeback_driver_name: li.chargeback_driver_name,
        chargeback_driver_id: li.chargeback_driver_id,
        chargeback_deducted_at: li.chargeback_deducted_at,
        category: li.category,
        description: li.description,
        complaint: null,
        cost: li.cost,
        date_opened: li.work_order?.date_opened,
        date_closed: li.work_order?.date_closed,
        invoice_ref: li.work_order?.invoice_ref,
        po_number: li.work_order?.po_number,
        mid_trip_inspection_id: li.work_order?.mid_trip_inspection_id,
        unit: li.work_order?.unit,
        vendor: li.work_order?.vendor,
        wo_number: li.work_order?.wo_number,
        driver: li.driver,
      };
      return { ...normalized, ...billedAmountFor(normalized, flatAmount), _source: "line_item" };
    });

    setRecords(
      [...fromWorkOrders, ...fromLineItems].sort((a, b) => (b.date_opened || "").localeCompare(a.date_opened || ""))
    );
    setLoading(false);
  }, [range?.start, range?.end]);

  useEffect(() => {
    load();
  }, [load]);

  const setDeducted = async (record, deducted) => {
    const table = record._source === "line_item" ? "work_order_line_items" : "work_orders";
    const deductedAt = deducted ? new Date().toISOString() : null;
    const { error: err } = await supabase.from(table).update({ chargeback_deducted_at: deductedAt }).eq("id", record.id);
    if (err) return err.message;
    setRecords((rs) => rs.map((r) => (r.id === record.id && r._source === record._source ? { ...r, chargeback_deducted_at: deductedAt } : r)));
    return null;
  };

  return { records, loading, error, reload: load, setDeducted };
}
