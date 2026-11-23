import { useState } from "react";
import { Alert } from "../../ds";
import { useDriverAppSignoutFlags } from "../../hooks/useDriverAppSignoutFlags";

const STATUS_LABEL = { offDuty: "off duty", sleeperBed: "in sleeper" };

function fmtDuration(hours) {
  const h = Number(hours) || 0;
  return h >= 48 ? `${Math.floor(h / 24)}d ${Math.round(h % 24)}h` : `${Math.round(h)}h`;
}

// Flag only (no points, no incident): drivers who have stayed signed in to a
// truck in the Samsara driver app for 48+ hours without working. Renders
// nothing when nobody is overdue. Rows come from a snapshot taken every 15
// minutes, so a driver is first flagged 48 hours after they were first seen idle.
export default function DriverAppSignoutBanner() {
  const { flags, loading, error } = useDriverAppSignoutFlags();
  const [expanded, setExpanded] = useState(false);

  if (loading) return null;
  if (error) {
    return (
      <Alert tone="critical" title="Couldn't check for drivers left signed in" style={{ marginTop: 16 }}>{error}</Alert>
    );
  }
  if (flags.length === 0) return null;

  const shown = expanded ? flags : flags.slice(0, 5);
  return (
    <Alert
      tone="critical"
      title={`${flags.length} ${flags.length === 1 ? "driver has" : "drivers have"} been signed in to the Samsara app for 48+ hours without driving`}
      style={{ marginTop: 16 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
        {shown.map((f) => (
          <div key={f.samsara_driver_id}>
            <strong>{f.driver_name}</strong> — truck {f.vehicle_name ?? "unknown"}, {STATUS_LABEL[f.duty_status] ?? f.duty_status} for {fmtDuration(f.hours_idle)}
          </div>
        ))}
      </div>
      {flags.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-link)", fontSize: 12, fontWeight: 600, padding: 0, marginTop: 8 }}
        >
          {expanded ? "Show fewer" : `Show all ${flags.length}`}
        </button>
      )}
    </Alert>
  );
}
