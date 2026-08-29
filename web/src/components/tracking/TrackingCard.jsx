const BORDER_BY_SEVERITY = {
  attention: "var(--clg-scarlet)",
  ok: "var(--clg-smoke)",
  no_data: "var(--clg-moon)",
};

function fmtClock(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function TrackingCard({ row }) {
  const { unit, trip, hos, eta } = row;
  const driverName = trip.driver?.name || unit.driver_name || "Driver not on file";

  return (
    <div style={{
      background: "var(--clg-surface-card)", border: "1px solid var(--clg-moon)",
      borderLeft: `4px solid ${BORDER_BY_SEVERITY[eta.severity]}`, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 17, color: "var(--clg-navy)" }}>
          {unit.number}
        </span>
        {eta.etaAt && (
          <span style={{
            fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14,
            color: eta.severity === "attention" ? "var(--clg-ruby)" : "var(--clg-pewter)",
          }}>
            ETA {fmtClock(eta.etaAt)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--clg-navy)", marginBottom: 2 }}>
        {trip.destination_name || "Destination not yet synced"}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--clg-cool)" }}>
        {[driverName, unit.current_location].filter(Boolean).join(" · ")}
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
