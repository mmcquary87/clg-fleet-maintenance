import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Same pastel-pill convention as LateLoadExposureTable's severity tags —
// green reads "comfortable," amber reads "keep an eye on it," even though
// both are still "on pace." Threshold is a dispatcher-legibility call, not
// part of the DE-01 spec's severity tiers (those only govern "Needs attention").
const BUFFER_TIGHT_HOURS = 2;
const BUFFER_STYLE = {
  comfortable: { background: "#E3F3EA", color: "#1F7A4D" },
  tight: { background: "#FBEED9", color: "#9A6B1E" },
};

const DEADLINE_LABEL = { window: "Window closes", appointment: "Appointment" };

function fmtFull(date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtHM(hours) {
  const abs = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function BufferPill({ hours }) {
  if (hours == null) return <span style={{ color: "var(--clg-mercury)" }}>—</span>;
  const tier = hours < BUFFER_TIGHT_HOURS ? "tight" : "comfortable";
  return (
    <span style={{
      display: "inline-block", fontSize: 11.5, fontWeight: 600, padding: "3px 10px",
      borderRadius: "var(--clg-radius-pill)", whiteSpace: "nowrap", ...BUFFER_STYLE[tier],
    }}>
      +{fmtHM(hours)} ahead
    </span>
  );
}

function DeadlineCell({ eta }) {
  if (!eta.deadline) return <span style={{ color: "var(--clg-mercury)" }}>Not on file</span>;
  return (
    <div>
      <div style={{ color: "var(--clg-navy)" }}>{fmtFull(new Date(eta.deadline))}</div>
      <div style={{ fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--clg-cool)" }}>
        {DEADLINE_LABEL[eta.deadlineType] ?? ""}
      </div>
    </div>
  );
}

function Row({ row, variant, zebra }) {
  const [open, setOpen] = useState(false);
  const { unit, trip, hos, eta } = row;
  const driverName = trip.driver?.name || unit.driver_name || "Driver not on file";
  const bg = zebra ? "var(--clg-surface-subtle)" : "transparent";

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", background: bg, borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}
      >
        <td style={{ padding: "12px 8px", fontSize: 13.5 }}>
          <div>
            <strong style={{ color: "var(--clg-navy)" }}>{unit.number}</strong>{" "}
            <span style={{ color: "var(--clg-cool)" }}>· {driverName}</span>
          </div>
          {trip.load_number && (
            <div style={{ fontSize: 11, color: "var(--clg-pewter)" }}>Load {trip.load_number}</div>
          )}
        </td>
        <td style={{ padding: "12px 8px", fontSize: 13, color: "var(--clg-granite)", maxWidth: 200 }}>
          {unit.current_location || <span style={{ color: "var(--clg-mercury)" }}>No GPS lock</span>}
        </td>
        <td style={{ padding: "12px 8px", fontSize: 13, color: "var(--clg-granite)", maxWidth: 200 }}>
          {trip.destination_name || "Not yet synced"}
        </td>
        {variant === "onTrack" && (
          <td style={{ padding: "12px 8px", fontSize: 13 }}><DeadlineCell eta={eta} /></td>
        )}
        <td style={{ padding: "12px 8px", fontSize: 13, color: "var(--clg-navy)" }}>
          {eta.projectedArrival ? fmtFull(eta.projectedArrival) : "—"}
        </td>
        {variant === "onTrack" ? (
          <td style={{ padding: "12px 8px" }}><BufferPill hours={eta.bufferHours} /></td>
        ) : (
          <td style={{ padding: "12px 8px", fontSize: 12.5, color: "var(--clg-pewter)", maxWidth: 260 }}>
            {eta.reason}
          </td>
        )}
        <td style={{ padding: "12px 8px", width: 24 }}>
          <ChevronDown size={15} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ background: bg, borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={variant === "onTrack" ? 6 : 5} style={{ padding: "0 8px 14px", fontSize: 12.5, color: "var(--clg-granite)" }}>
            <div style={{ background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px", lineHeight: 1.6 }}>
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

const ON_TRACK_HEADERS = ["Unit / driver", "Current location", "Destination", "Appointment", "Projected arrival", "Buffer", ""];
const NO_DATA_HEADERS = ["Unit / driver", "Current location", "Destination", "Projected arrival", "Why", ""];

// A compact table for loads that don't need per-field emphasis (unlike the
// Needs Attention section, there's no severity to lead with) — a quick scan
// of unit/driver, live position, destination, and either a colored buffer
// read (on track) or the specific reason ETA can't be computed (missing
// data), each expandable for the fuller narrative a TrackingCard used to
// show all at once.
export default function SimpleTrackingTable({ rows, variant }) {
  const headers = variant === "onTrack" ? ON_TRACK_HEADERS : NO_DATA_HEADERS;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
          {headers.map((h, i) => (
            <th key={h || i} style={{
              textAlign: "left", padding: "0 8px 8px", fontFamily: "var(--clg-font-heading)",
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => <Row key={row.unit.id} row={row} variant={variant} zebra={i % 2 === 1} />)}
      </tbody>
    </table>
  );
}
