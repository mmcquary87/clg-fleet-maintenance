import { supabase } from "./supabaseClient";
import { norm } from "./workOrderDuplicates";

// Finds an open, not-yet-finalized estimate work order for this unit+vendor,
// so a final invoice landing later in the Receipt Inbox can be matched to it
// instead of starting a brand-new work order. Deliberately NOT based on cost
// matching the way workOrderDuplicates.js is -- the whole point of an
// estimate is that the final invoice's cost is expected to differ from it.
// Most recent (by date_opened) open estimate wins when more than one exists
// for the same unit+vendor, since that's almost always the one still
// awaiting its final bill.
export async function findOpenEstimateWorkOrder({ unitNumber, vendorName }) {
  const unitTrimmed = (unitNumber || "").trim();
  const vendorTrimmed = (vendorName || "").trim();
  if (!unitTrimmed || !vendorTrimmed) return null;

  const [{ data: unit }, { data: vendor }] = await Promise.all([
    supabase.from("units").select("id").ilike("number", norm(unitTrimmed)).maybeSingle(),
    supabase.from("vendors").select("id").ilike("name", norm(vendorTrimmed)).maybeSingle(),
  ]);
  if (!unit || !vendor) return null;

  const { data } = await supabase
    .from("work_orders")
    .select("id, wo_number, estimated_cost, date_opened, status")
    .eq("unit_id", unit.id)
    .eq("vendor_id", vendor.id)
    .eq("is_estimate", true)
    .eq("voided", false)
    .order("date_opened", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}
