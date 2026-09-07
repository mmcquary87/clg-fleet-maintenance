// Shared blocker classification for an open work order — used by the Board
// (lane assignment) and the Work Orders list ("Blocked On" column) so both
// pages describe the same order the same way. Per the CLG OS design
// package's core argument: "status names the blocker and its owner, not a
// lifecycle stage" — never render a raw status word for an open item.
export const LANES = ["waiting_on_you", "waiting_on_vendor", "waiting_on_parts", "in_the_bay"];

export function laneFor(wo) {
  if (wo.approval_status === "needs_approval") return "waiting_on_you";
  if (wo.waiting_on_parts) return "waiting_on_parts";
  if (wo.assigned_bay && wo.status === "In Progress") return "in_the_bay";
  if (wo.vendor_id) return "waiting_on_vendor";
  return "waiting_on_you";
}

export const LANE_LABEL = {
  waiting_on_you: "Your authorization",
  waiting_on_vendor: "Vendor in progress",
  waiting_on_parts: "Parts on order",
  in_the_bay: "In the bay",
};

// "Blocked on" text for any work order, open or closed/voided — this is
// what the Work Orders list shows instead of a plain status word.
export function blockedOnText(wo) {
  if (wo.voided) return "Voided";
  if (wo.status === "Closed") return wo.date_closed ? `Closed ${wo.date_closed}` : "Closed";
  return LANE_LABEL[laneFor(wo)];
}
