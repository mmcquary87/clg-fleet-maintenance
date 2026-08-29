const BORDER_BY_SEVERITY = {
  attention: "var(--clg-scarlet)",
  ok: "var(--clg-smoke)",
  no_data: "var(--clg-moon)",
};

function fmtFull(date) {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontFamily: "var(--clg-font-heading)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 12.5, fontWeight: accent ? 700 : 500, color: accent ? "var(--clg-ruby)" : "var(--clg-navy)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

export default function TrackingCard({ row }) {
  const { unit, trip, hos, eta } = row;
  const driverName = trip.driver?.name || unit.driver_name || "Driver not on file";
  const appointmentLabel = eta.deadlineType === "window" ? "Window closes" : "Appointment";

  return (
    <div style={{
      background: "var(--clg-surface-card)", border: "1px solid var(--clg-moon)",
      borderLeft: `4px solid ${BORDER_BY_SEVERITY[eta.severity]}`, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 17, color: "var(--clg-navy)" }}>
          {unit.number}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--clg-cool)" }}>{driverName}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px" }}>
        <Stat label="Current location" value={unit.current_location || "No GPS lock yet"} />
        <Stat label="Delivery location" value={trip.destination_name || "Not yet synced"} />
        <Stat
          label="Projected ETA"
          value={eta.etaAt ? fmtFull(eta.etaAt) : "—"}
          accent={eta.severity === "attention"}
        />
        <Stat
          label={eta.deadline ? appointmentLabel : "Appointment"}
          value={eta.deadline ? fmtFull(new Date(eta.deadline)) : "Not on file"}
        />
      </div>

      <div style={{ borderTop: "1px solid var(--clg-smoke)", margin: "10px 0" }} />
      <div style={{ fontSize: 12, color: "var(--clg-granite)" }}>{eta.reason}</div>

      {(eta.distanceRemainingMiles != null || hos?.duty_status) && (
        <div style={{ fontSize: 11, color: "var(--clg-cool)", marginTop: 8 }}>
          {eta.distanceRemainingMiles != null && `${Math.round(eta.distanceRemainingMiles).toLocaleString()} mi remaining (straight-line)`}
          {eta.distanceRemainingMiles != null && hos?.duty_status && " · "}
          {hos?.duty_status && `driver ${hos.duty_status}`}
        </div>
      )}
    </div>
  );
}
