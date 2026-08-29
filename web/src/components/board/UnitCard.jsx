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

  // Collapsed (non-lead) rows are a single compact line, not a stacked
  // mini-card — matches the design package's "remaining items collapse to
  // a single grid row" treatment for everything below the one expanded item.
  if (!lead) {
    const description = wo.system_component || wo.complaint || wo.description || wo.category;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 14, background: "var(--clg-surface-card)",
        boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)", padding: "12px 16px",
      }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", flexShrink: 0 }}>
          {unit.number}
        </span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 13, color: "var(--clg-granite)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {description}{openCount > 1 && <span style={{ color: "var(--clg-cool)" }}> +{openCount - 1} more</span>}
        </span>
        <span style={{
          fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13, flexShrink: 0,
          color: overDay ? "var(--clg-ruby)" : "var(--clg-pewter)",
        }}>
          {fmtHours(idleHours)}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-focus)",
      borderRadius: "var(--clg-radius-md)", borderTop: "3px solid var(--clg-scarlet)", padding: "18px 20px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: "var(--clg-navy)" }}>
          {unit.number}
        </span>
        <span style={{
          fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 17,
          color: overDay ? "var(--clg-ruby)" : "var(--clg-pewter)",
        }}>
          {fmtHours(idleHours)}
        </span>
      </div>

      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 400, fontSize: 21, color: "var(--clg-navy)", marginBottom: 4 }}>
        {blockerSentence}
      </div>
      {(unit.current_location || unit.driver_name) && (
        <div style={{ fontSize: 12.5, color: "var(--clg-cool)" }}>
          {[unit.current_location, unit.driver_name].filter(Boolean).join(" · ")}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--clg-smoke)", margin: "14px 0 12px" }} />
      <div style={{ fontSize: 13, color: "var(--clg-granite)", marginBottom: 12 }}>
        {costOfWaiting > 0 && <strong style={{ color: "var(--clg-navy)" }}>{money(costOfWaiting)}</strong>}
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
    </div>
  );
}
