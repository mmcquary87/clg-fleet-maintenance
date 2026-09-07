import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, Clock, Search } from "lucide-react";
import { Eyebrow, Alert, Badge, Input } from "../../ds";
import { useReloadGaps } from "../../hooks/useReloadGaps";
import { useIsMobile } from "../../hooks/useIsMobile";
import UnitDrawer from "../shared/UnitDrawer";

function fmtDeadline(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function hoursUntil(iso) {
  return (new Date(iso).getTime() - Date.now()) / 3600000;
}

function fmtHoursUntil(iso) {
  const h = hoursUntil(iso);
  if (h < 0) return "Past due";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function driverNameForNoPlan(u) {
  return u.driver_name || "Driver not on file";
}

function driverNameForSoon(row) {
  return row.trip.driver?.name || row.unit.driver_name || "Driver not on file";
}

function StatBlock({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 40, color: tone || "var(--clg-navy)", marginTop: 8, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ children, style }) {
  return (
    <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", ...style }}>
      {children}
    </div>
  );
}

// Compact search across both tables, matching on driver name or unit number
// — driver is the primary way a dispatcher looks someone up here now, unit
// is the fallback for whoever still thinks in truck numbers.
function matchesQuery(query, driverName, unitNumber) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return driverName.toLowerCase().includes(q) || unitNumber.toLowerCase().includes(q);
}

function NoPlanCard({ u, onOpenUnit }) {
  return (
    <div
      onClick={() => onOpenUnit(u.id)}
      style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 14, marginBottom: 10, cursor: "pointer" }}
    >
      <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--clg-navy)" }}>{driverNameForNoPlan(u)}</div>
      <div style={{ fontSize: 12, color: "var(--clg-royal)", marginTop: 2 }}>Unit {u.number}</div>
      <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 6 }}>{u.current_location || "No location on file"}</div>
    </div>
  );
}

function SoonCard({ row, onOpenUnit }) {
  const { unit, trip, deadline } = row;
  return (
    <div
      onClick={() => onOpenUnit(unit.id)}
      style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 14, marginBottom: 10, cursor: "pointer" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--clg-navy)" }}>{driverNameForSoon(row)}</div>
          <div style={{ fontSize: 12, color: "var(--clg-royal)", marginTop: 2 }}>Unit {unit.number}</div>
        </div>
        <Badge tone={hoursUntil(deadline) < 6 ? "critical" : "accent"}>{fmtHoursUntil(deadline)}</Badge>
      </div>
      <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>
        {trip.load_number ? `Load ${trip.load_number} · ` : ""}{trip.stop_name || "Destination not synced"}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>Due {fmtDeadline(deadline)}</div>
    </div>
  );
}

export default function ReloadsView() {
  const { noPlan, deliveringSoon, loading, error, DELIVERING_SOON_HOURS } = useReloadGaps();
  const [openUnitId, setOpenUnitId] = useState(null);
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();

  const visibleNoPlan = useMemo(
    () => noPlan.filter((u) => matchesQuery(query, driverNameForNoPlan(u), u.number)),
    [noPlan, query]
  );
  const visibleSoon = useMemo(
    () => deliveringSoon.filter((row) => matchesQuery(query, driverNameForSoon(row), row.unit.number)),
    [deliveringSoon, query]
  );

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Reloads</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Drivers who need a load</h2>
          <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6, maxWidth: 640 }}>
            Active drivers with nothing dispatched in Alvys right now, plus drivers on a delivery that's due within {DELIVERING_SOON_HOURS} hours — worth confirming a next load is booked before they go empty.
          </p>
        </div>
        <div style={{ position: "relative", width: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--clg-cool)" }} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Look up a driver or unit…" style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {error && <Alert tone="critical" title="Couldn't load reload data" style={{ marginBottom: 16 }}>{error}</Alert>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading…
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
            <SectionCard style={{ padding: 20, borderTop: `4px solid ${noPlan.length > 0 ? "var(--clg-scarlet)" : "var(--clg-moon)"}` }}>
              <StatBlock label="No plan" value={noPlan.length} tone={noPlan.length > 0 ? "var(--clg-scarlet)" : undefined} />
            </SectionCard>
            <SectionCard style={{ padding: 20, borderTop: `4px solid ${deliveringSoon.length > 0 ? "var(--clg-royal)" : "var(--clg-moon)"}` }}>
              <StatBlock label="Delivering soon" value={deliveringSoon.length} tone={deliveringSoon.length > 0 ? "var(--clg-royal)" : undefined} />
            </SectionCard>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={15} color="var(--clg-scarlet)" />
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>No plan</div>
          </div>
          {isMobile ? (
            <div style={{ marginBottom: 26 }}>
              {visibleNoPlan.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
                  {noPlan.length === 0 ? "Every active truck has a trip on file in Alvys right now." : "No driver or unit matches that search."}
                </div>
              ) : (
                visibleNoPlan.map((u) => <NoPlanCard key={u.id} u={u} onOpenUnit={setOpenUnitId} />)
              )}
            </div>
          ) : (
            <SectionCard style={{ marginBottom: 26 }}>
              {visibleNoPlan.length === 0 ? (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
                  {noPlan.length === 0 ? "Every active truck has a trip on file in Alvys right now." : "No driver or unit matches that search."}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                  <thead>
                    <tr>
                      {["Driver", "Unit", "Current location"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                          fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                          borderBottom: "2px solid var(--clg-border-default)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNoPlan.map((u, i) => (
                      <tr
                        key={u.id} onClick={() => setOpenUnitId(u.id)}
                        style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}
                      >
                        <td style={{ padding: "11px 16px", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {driverNameForNoPlan(u)}
                        </td>
                        <td style={{ padding: "11px 16px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-royal)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {u.number}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {u.current_location || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Clock size={15} color="var(--clg-royal)" />
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>Delivering soon</div>
          </div>
          {isMobile ? (
            <div>
              {visibleSoon.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
                  {deliveringSoon.length === 0 ? `No delivery due within ${DELIVERING_SOON_HOURS} hours right now.` : "No driver or unit matches that search."}
                </div>
              ) : (
                visibleSoon.map((row) => <SoonCard key={row.unit.id} row={row} onOpenUnit={setOpenUnitId} />)
              )}
            </div>
          ) : (
            <SectionCard>
              {visibleSoon.length === 0 ? (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
                  {deliveringSoon.length === 0 ? `No delivery due within ${DELIVERING_SOON_HOURS} hours right now.` : "No driver or unit matches that search."}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                  <thead>
                    <tr>
                      {["Driver", "Unit", "Load #", "Delivering to", "Deadline", "Time left"].map((h) => (
                        <th key={h} style={{
                          textAlign: h === "Time left" ? "right" : "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                          fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                          borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSoon.map((row, i) => {
                      const { unit, trip, deadline } = row;
                      return (
                        <tr
                          key={unit.id} onClick={() => setOpenUnitId(unit.id)}
                          style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}
                        >
                          <td style={{ padding: "11px 16px", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                            {driverNameForSoon(row)}
                          </td>
                          <td style={{ padding: "11px 16px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-royal)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                            {unit.number}
                          </td>
                          <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                            {trip.load_number || "—"}
                          </td>
                          <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", maxWidth: 220 }}>
                            {trip.stop_name || "—"}
                          </td>
                          <td style={{ padding: "11px 16px", color: "var(--clg-text-body)", borderBottom: "1px solid var(--clg-border-subtle)", fontFamily: "var(--clg-font-mono, monospace)" }}>
                            {fmtDeadline(deadline)}
                          </td>
                          <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)", textAlign: "right" }}>
                            <Badge tone={hoursUntil(deadline) < 0 ? "critical" : hoursUntil(deadline) < 6 ? "critical" : "accent"}>
                              {fmtHoursUntil(deadline)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </SectionCard>
          )}
        </>
      )}

      {openUnitId && <UnitDrawer unitId={openUnitId} onClose={() => setOpenUnitId(null)} />}
    </div>
  );
}
