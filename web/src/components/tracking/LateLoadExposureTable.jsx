import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Draft, unapproved severity tiers (late-load-exposure-calc-spec.md) — pastel
// pills for the two that need to visually stand out; "Watch" stays plain
// text since it isn't yet an escalation, just something to keep an eye on.
const TIER_STYLE = {
  Critical: { background: "#FBE4E1", color: "var(--clg-ruby)" },
  Warning: { background: "#FBEED9", color: "#9A6B1E" },
};

function fmtFull(date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtHM(hours) {
  const abs = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SeverityTag({ tier }) {
  const style = TIER_STYLE[tier];
  if (!style) {
    return <span style={{ fontSize: 12.5, color: "var(--clg-pewter)" }}>{tier}</span>;
  }
  return (
    <span style={{
      display: "inline-block", fontSize: 11.5, fontWeight: 600, padding: "3px 10px",
      borderRadius: "var(--clg-radius-pill)", ...style,
    }}>
      {tier}
    </span>
  );
}

function Row({ row }) {
  const [open, setOpen] = useState(false);
  const { unit, trip, eta } = row;
  const driverName = trip.driver?.name || unit.driver_name || "Driver not on file";

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}
      >
        <td style={{ padding: "12px 8px" }}><SeverityTag tier={eta.severityTier} /></td>
        <td style={{ padding: "12px 8px", fontSize: 13.5, color: "var(--clg-navy)" }}>
          <div><strong>{unit.number}</strong> <span style={{ color: "var(--clg-cool)" }}>· {driverName}</span></div>
          {trip.load_number && (
            <div style={{ fontSize: 11, color: "var(--clg-pewter)" }}>Load {trip.load_number}</div>
          )}
        </td>
        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 700, fontSize: 13.5, color: "var(--clg-ruby)" }}>
          {fmtHM(eta.hoursShort)}
        </td>
        <td style={{ padding: "12px 8px", width: 24 }}>
          <ChevronDown size={15} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={4} style={{ padding: "0 8px 14px", fontSize: 12.5, color: "var(--clg-granite)" }}>
            <div style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px", lineHeight: 1.6 }}>
              <div>{eta.reason}</div>
              <div style={{ marginTop: 6, color: "var(--clg-cool)" }}>
                {unit.current_location || "No GPS lock"} → {trip.destination_name || "destination not yet synced"}
                {" · "}projected {eta.projectedArrival ? fmtFull(eta.projectedArrival) : "—"}
                {eta.deadline && ` · deadline ${fmtFull(new Date(eta.deadline))}`}
                {eta.leadTimeHours != null && ` · ${fmtHM(eta.leadTimeHours)} lead time to react`}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Matches the DE-01 Late Load Exposure mockup: tier counts up top, rows
// sorted worst-first (already done by useTracking), each expandable for
// detail instead of showing every field in a full card grid.
export default function LateLoadExposureTable({ rows }) {
  const counts = { Critical: 0, Warning: 0, Watch: 0 };
  for (const r of rows) {
    if (counts[r.eta.severityTier] != null) counts[r.eta.severityTier] += 1;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 40, marginBottom: 16 }}>
        {["Critical", "Warning", "Watch"].map((tier) => (
          <div key={tier}>
            <div style={{ fontSize: 12.5, color: "var(--clg-pewter)" }}>{tier}</div>
            <div style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 28,
              color: tier === "Critical" ? "var(--clg-ruby)" : tier === "Warning" ? "#9A6B1E" : "var(--clg-navy)",
            }}>
              {counts[tier]}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--clg-cool)", marginBottom: 10 }}>
        Projected arrival factors in required HOS resets, but the drive-time input is still a 55mph
        straight-line estimate until routed ETAs connect. Sorted by hours short of the deadline.
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
            {["Severity", "Unit / driver", "Hours short", ""].map((h, i) => (
              <th key={h} style={{
                textAlign: i === 2 ? "right" : "left", padding: "0 8px 8px", fontFamily: "var(--clg-font-heading)",
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <Row key={row.unit.id} row={row} />)}
        </tbody>
      </table>
    </div>
  );
}
