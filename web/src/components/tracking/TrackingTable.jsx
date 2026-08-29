import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { StatusPill } from "../../ds";

function fmtFull(date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtHM(hours) {
  if (hours == null) return "—";
  const abs = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ui-improvement-punch-list.md's ETA Cushion: one signed number instead of
// a prose sentence. bufferHours > 0 -> ahead (green); hoursShort > 0 ->
// short (red). Neither on file -> no deadline to measure against.
function CushionPill({ eta }) {
  if (eta.cushionHours == null) return <span style={{ color: "var(--clg-mercury)" }}>—</span>;
  if (eta.cushionHours >= 0) {
    return <StatusPill tone="green">+{fmtHM(eta.cushionHours)}</StatusPill>;
  }
  return <StatusPill tone="red">-{fmtHM(eta.cushionHours)}</StatusPill>;
}

// Per the punch list: "No appointment on file" is a data-quality gap, not
// a good status — it shouldn't share a color with genuinely on-pace loads,
// so it gets Pending (no color judgment), not Green.
function StatusCell({ eta }) {
  if (eta.severity === "attention") return <StatusPill tone="red">Late risk</StatusPill>;
  if (eta.severity === "ok" && eta.hasAppointment) return <StatusPill tone="green">On track</StatusPill>;
  if (eta.severity === "ok") return <StatusPill tone="pending">No appointment on file</StatusPill>;
  return <StatusPill tone="neutral">Missing data</StatusPill>;
}

function HosCell({ hos, eta }) {
  if (!eta.hasHos) return <span style={{ color: "var(--clg-mercury)" }}>—</span>;
  return (
    <div>
      <div style={{ color: "var(--clg-navy)" }}>{fmtHM(eta.driveRemainingHours)} left</div>
      {hos?.duty_status && (
        <div style={{ fontSize: 10.5, color: "var(--clg-cool)", textTransform: "capitalize" }}>{hos.duty_status}</div>
      )}
    </div>
  );
}

function Row({ row, zebra, onOpenUnit }) {
  const [open, setOpen] = useState(false);
  const { unit, trip, eta } = row;
  const driverName = trip.driver?.name || unit.driver_name || "Driver not on file";
  const bg = zebra ? "var(--clg-surface-subtle)" : "transparent";

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", background: bg, borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}
      >
        <td style={{ padding: "10px 8px", fontSize: 13 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenUnit(unit.id); }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--clg-royal)", fontWeight: 700, textDecoration: "underline" }}
          >
            {unit.number}
          </button>
        </td>
        <td style={{ padding: "10px 8px", fontSize: 13, color: "var(--clg-granite)" }}>{driverName}</td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-granite)", maxWidth: 160 }}>
          {unit.current_location || <span style={{ color: "var(--clg-mercury)" }}>No GPS lock</span>}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-granite)", maxWidth: 160 }}>
          {trip.destination_name || "Not yet synced"}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-navy)" }}>
          {eta.projectedArrival ? fmtFull(eta.projectedArrival) : "—"}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-navy)" }}>
          {eta.deadline ? fmtFull(new Date(eta.deadline)) : <span style={{ color: "var(--clg-mercury)" }}>—</span>}
        </td>
        <td style={{ padding: "10px 8px" }}><CushionPill eta={eta} /></td>
        <td style={{ padding: "10px 8px", fontSize: 12.5 }}><HosCell hos={row.hos} eta={eta} /></td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-granite)", textAlign: "right" }}>
          {eta.distanceRemainingMiles != null ? Math.round(eta.distanceRemainingMiles).toLocaleString() : "—"}
        </td>
        <td style={{ padding: "10px 8px" }}><StatusCell eta={eta} /></td>
        <td style={{ padding: "10px 8px", width: 20 }}>
          <ChevronDown size={14} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ background: bg, borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={11} style={{ padding: "0 8px 14px", fontSize: 12.5, color: "var(--clg-granite)" }}>
            <div style={{ background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px", lineHeight: 1.6 }}>
              <div>{eta.reason}</div>
              {trip.load_number && (
                <div style={{ marginTop: 6, color: "var(--clg-cool)" }}>Load {trip.load_number}</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const HEADERS = [
  "Unit", "Driver", "Current location", "Destination", "ETA", "Appt", "ETA Cushion", "HOS", "Miles remaining", "Status", "",
];

// One dense table for every unit on an active load (ui-improvement-punch-
// list.md's Tracking rebuild) — replaces the old three-section split
// (Needs attention/On track/Missing data). Rows already arrive worst-first
// from useTracking (attention's negative cushion, then onTrack's positive
// cushion, then noData last), so the whole table reads as one continuous
// risk gradient instead of three separately-sorted lists.
export default function TrackingTable({ rows, onOpenUnit }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
            {HEADERS.map((h, i) => (
              <th key={h || i} style={{
                textAlign: i === 8 ? "right" : "left", padding: "0 8px 8px", fontFamily: "var(--clg-font-heading)",
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)", whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => <Row key={row.unit.id} row={row} zebra={i % 2 === 1} onOpenUnit={onOpenUnit} />)}
        </tbody>
      </table>
    </div>
  );
}
