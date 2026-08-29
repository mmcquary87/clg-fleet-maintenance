import { Loader2, Navigation } from "lucide-react";
import { Card, Badge, Eyebrow, Alert } from "../../ds";
import { useTracking, ASSUMED_MPH } from "../../hooks/useTracking";

function fmtHours(h) {
  if (h == null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

function fmtEta(date) {
  if (!date) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function riskTone(eta) {
  if (eta.hosShortfall || eta.lateRisk) return "critical";
  if (eta.lateRisk === null && eta.hosShortfall === null) return "neutral";
  return "brand";
}

function riskLabel(eta) {
  if (eta.hosShortfall && eta.lateRisk) return "HOS risk + late";
  if (eta.hosShortfall) return "HOS risk";
  if (eta.lateRisk) return "Running late";
  if (eta.lateRisk === false) return "On track";
  return "Not enough data";
}

export default function TrackingView() {
  const { rows, loading, error, reload } = useTracking();

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Proactive Tracking</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Navigation size={20} /> Units in transit
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 720 }}>
            Position refreshes every 15 minutes from Samsara. ETA assumes {ASSUMED_MPH} mph over the
            straight-line distance remaining — a floor, not a promise, until Google Maps traffic-aware
            routing is connected. HOS risk flags a driver whose remaining drive-clock is shorter than the
            drive time this ETA needs, not a full hours-of-service reset simulation.
          </p>
        </div>
      </div>

      {error && <Alert tone="critical" title="Couldn't load tracking data" style={{ marginBottom: 16 }}>{error}</Alert>}

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading tracking data…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            No units currently have an active trip on file. This page is wired up and ready — it's waiting
            on the Alvys active-trip sync (destination + delivery window) and Samsara HOS sync (driver
            clocks) to start populating <code>unit_current_trip</code> / <code>unit_hos_status</code>.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
            <thead>
              <tr>
                {["Unit", "Driver", "Destination", "Distance left", "Drive time needed", "HOS remaining", "ETA", "Appointment", "Risk"].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                    fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                    borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ trip, unit, hos, eta }, i) => (
                <tr key={unit.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                  <td style={{ padding: "11px 16px", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    {unit.number}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    {trip.driver?.name || unit.driver_name || "—"}
                  </td>
                  <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    {trip.destination_name || "—"}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)", fontVariantNumeric: "tabular-nums" }}>
                    {eta.distanceRemainingMiles != null ? `${Math.round(eta.distanceRemainingMiles).toLocaleString()} mi` : "—"}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtHours(eta.driveHoursNeeded)}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtHours(eta.driveRemainingHours)}
                    {hos?.duty_status && <span style={{ color: "var(--clg-text-muted)" }}> · {hos.duty_status}</span>}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    {fmtEta(eta.etaAt)}
                  </td>
                  <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    {eta.deadline ? fmtEta(new Date(eta.deadline)) : "—"}
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    <Badge tone={riskTone(eta)}>{riskLabel(eta)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <button
        onClick={reload}
        style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11.5, color: "var(--clg-royal)", textDecoration: "underline" }}
      >
        Refresh now
      </button>
    </div>
  );
}
