import { useState } from "react";
import { ChevronDown } from "lucide-react";

function fmtFull(date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtHM(hours) {
  const abs = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Row({ row, variant }) {
  const [open, setOpen] = useState(false);
  const { unit, trip, hos, eta } = row;
  const driverName = trip.driver?.name || unit.driver_name || "Driver not on file";

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}
      >
        <td style={{ padding: "12px 8px", fontSize: 13.5 }}>
          <strong style={{ color: "var(--clg-navy)" }}>{unit.number}</strong>{" "}
          <span style={{ color: "var(--clg-cool)" }}>· {driverName}</span>
        </td>
        <td style={{ padding: "12px 8px", fontSize: 13, color: "var(--clg-granite)", maxWidth: 220 }}>
          {trip.destination_name || "Not yet synced"}
        </td>
        <td style={{ padding: "12px 8px", fontSize: 13, color: "var(--clg-navy)" }}>
          {eta.projectedArrival ? fmtFull(eta.projectedArrival) : "—"}
        </td>
        <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--clg-royal)" }}>
          {variant === "onTrack" && eta.bufferHours != null ? `+${fmtHM(eta.bufferHours)}` : "—"}
        </td>
        <td style={{ padding: "12px 8px", width: 24 }}>
          <ChevronDown size={15} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={5} style={{ padding: "0 8px 14px", fontSize: 12.5, color: "var(--clg-granite)" }}>
            <div style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px", lineHeight: 1.6 }}>
              <div>{eta.reason}</div>
              <div style={{ marginTop: 6, color: "var(--clg-cool)" }}>
                {unit.current_location || "No GPS lock"} → {trip.destination_name || "destination not yet synced"}
                {eta.deadline && ` · deadline ${fmtFull(new Date(eta.deadline))}`}
                {hos?.duty_status && ` · driver ${hos.duty_status}`}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// A compact table for loads that don't need per-field emphasis (unlike the
// Needs Attention section, there's no severity to lead with) — a quick scan
// of unit/driver, destination, projected arrival, and buffer/status, each
// expandable for the full detail a TrackingCard used to show all at once.
export default function SimpleTrackingTable({ rows, variant }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
          {["Unit / driver", "Destination", "Projected arrival", variant === "onTrack" ? "Buffer" : "", ""].map((h, i) => (
            <th key={h || i} style={{
              textAlign: i === 3 ? "right" : "left", padding: "0 8px 8px", fontFamily: "var(--clg-font-heading)",
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => <Row key={row.unit.id} row={row} variant={variant} />)}
      </tbody>
    </table>
  );
}
