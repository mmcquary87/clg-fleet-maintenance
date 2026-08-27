import { Button } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

const ACTION_BY_LANE = {
  waiting_on_you: { label: "Authorize", variant: "primary" },
  waiting_on_vendor: { label: "Chase vendor", variant: "outline" },
  waiting_on_parts: { label: "Update ETA", variant: "outline" },
  in_the_bay: null,
};

function fmtHours(h) {
  if (h < 1) return "<1h";
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function money(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function UnitCard({ card, lead, onChanged }) {
  const { unit, wo, openCount, idleHours, costOfWaiting, hourlyRate, lane } = card;
  const overDay = idleHours >= 24;
  const action = ACTION_BY_LANE[lane];

  const blockerSentence = {
    waiting_on_you: wo.vendor
      ? `${wo.vendor.name} is waiting on your authorization to start.`
      : "Waiting on an in-house authorization to start.",
    waiting_on_vendor: wo.vendor
      ? `${wo.vendor.name} has this — ${wo.promised_back ? `promised back ${new Date(wo.promised_back).toLocaleDateString()}` : "no promise time logged"}.`
      : "Assigned to an outside vendor.",
    waiting_on_parts: wo.parts_eta
      ? `Part ships, ETA ${new Date(wo.parts_eta).toLocaleDateString()}.`
      : "Waiting on a part — no ETA logged yet.",
    in_the_bay: wo.assigned_bay ? `In ${wo.assigned_bay}${wo.assigned_tech ? ` · ${wo.assigned_tech}` : ""}.` : "In the bay.",
  }[lane];

  const authorize = async () => {
    await supabase.from("work_orders").update({
      approval_status: "approved",
      approved_by: (await supabase.auth.getUser()).data.user?.email,
      approved_at: new Date().toISOString(),
    }).eq("id", wo.id);
    onChanged?.();
  };

  return (
    <div style={{
      background: "var(--clg-surface-card)", border: "1px solid var(--clg-moon)",
      padding: lead ? "15px 16px" : "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: lead ? 19 : 17, color: "var(--clg-navy)" }}>
          {unit.number}
        </span>
        <span style={{
          fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: lead ? 17 : 14,
          color: overDay ? "var(--clg-ruby)" : "var(--clg-pewter)",
        }}>
          {fmtHours(idleHours)}
        </span>
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--clg-navy)", marginBottom: 2 }}>
        {wo.system_component || wo.complaint || wo.description || wo.category}
      </div>
      {(unit.current_location || unit.driver_name) && (
        <div style={{ fontSize: 11.5, color: "var(--clg-cool)" }}>
          {[unit.current_location, unit.driver_name].filter(Boolean).join(" · ")}
        </div>
      )}

      {lead && (
        <>
          <div style={{ borderTop: "1px solid var(--clg-smoke)", margin: "10px 0" }} />
          <div style={{ fontSize: 12, color: "var(--clg-granite)", marginBottom: 10 }}>
            {blockerSentence} {costOfWaiting > 0 && <strong style={{ color: "var(--clg-navy)" }}>{money(costOfWaiting)}</strong>}
          </div>
          {action && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button size="sm" variant={action.variant} onClick={lane === "waiting_on_you" ? authorize : undefined}>
                {action.label}
              </Button>
            </div>
          )}
          {hourlyRate > 0 && (
            <div style={{ fontSize: 11, color: "var(--clg-cool)", marginTop: 8 }}>
              ${Math.round(hourlyRate)}/hr to keep thinking about it
            </div>
          )}
        </>
      )}
      {!lead && openCount > 1 && (
        <div style={{ fontSize: 11, color: "var(--clg-cool)", marginTop: 4 }}>+{openCount - 1} more open</div>
      )}
    </div>
  );
}
