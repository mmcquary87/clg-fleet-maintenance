import { supabase } from "./supabaseClient";

// Best-effort: a failed log write shouldn't block or roll back the real
// action it's describing (same tradeoff as markCreated's "cosmetic miss"
// in ReceiptInboxView.jsx) -- it's swallowed, not surfaced as an error.
export async function logWorkOrderActivity({ workOrderId, woNumber, action, detail }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("work_order_activity_log").insert({
      work_order_id: workOrderId,
      wo_number: woNumber,
      action,
      actor: user?.email || "Unknown",
      detail: detail || null,
    });
  } catch {
    // logging failure is never worth surfacing over the real action
  }
}
