import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, Clock, TrendingDown, Search } from "lucide-react";
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

function fmtGap(hours) {
  if (hours == null) return "No next load booked";
  if (hours < 0) return "Overlaps current load";
  return `${hours.toFixed(1)}h gap before next load`;
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

function SectionHeader({ icon, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon}
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>{title}</div>
    </div>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>{text}</div>
  );
}

function matchesQuery(query, driverName, unitNumber) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return driverName.toLowerCase().includes(q) || (unitNumber || "").toLowerCase().includes(q);
}

export default function ReloadsView() {
  const {
    noPlan, gapAhead, highDeadhead, loading, error,
    DELIVERING_SOON_HOURS, EMPTY_MILE_TARGET_PCT,
  } = useReloadGaps();
  const [openUnitId, setOpenUnitId] = useState(null);
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();

  const visibleNoPlan = useMemo(
    () => noPlan.filter((d) => matchesQuery(query, d.name, "")),
    [noPlan, query]
  );
  const visibleGaps = useMemo(
    () => gapAhead.filter((row) => matchesQuery(query, row.driver.name, row.current.unit?.number)),
    [gapAhead, query]
  );
  const visibleDeadheads = useMemo(
    () => highDeadhead.filter((row) => matchesQuery(query, row.driver.name, row.trip.unit?.number)),
    [highDeadhead, query]
  );

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Reloads</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Drivers who need a load</h2>
          <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6, maxWidth: 680 }}>
            Capacity is judged by driver, not truck: active drivers with nothing dispatched in Alvys at all,
            drivers delivering within {DELIVERING_SOON_HOURS} hours with a real gap before their next load, and
            drivers whose next load has more deadhead than the fleet's {EMPTY_MILE_TARGET_PCT}% planned-empty-mile target.
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 22 }}>
            <SectionCard style={{ padding: 20, borderTop: `4px solid ${noPlan.length > 0 ? "var(--clg-scarlet)" : "var(--clg-moon)"}` }}>
              <StatBlock label="No plan" value={noPlan.length} tone={noPlan.length > 0 ? "var(--clg-scarlet)" : undefined} />
            </SectionCard>
            <SectionCard style={{ padding: 20, borderTop: `4px solid ${gapAhead.length > 0 ? "var(--clg-royal)" : "var(--clg-moon)"}` }}>
              <StatBlock label="Reload gap ahead" value={gapAhead.length} tone={gapAhead.length > 0 ? "var(--clg-royal)" : undefined} />
            </SectionCard>
            <SectionCard style={{ padding: 20, borderTop: `4px solid ${highDeadhead.length > 0 ? "var(--clg-ruby)" : "var(--clg-moon)"}` }}>
              <StatBlock label="Long deadhead ahead" value={highDeadhead.length} tone={highDeadhead.length > 0 ? "var(--clg-ruby)" : undefined} />
            </SectionCard>
          </div>

          <SectionHeader icon={<AlertTriangle size={15} color="var(--clg-scarlet)" />} title="No plan" />
          {isMobile ? (
            <div style={{ marginBottom: 26 }}>
              {visibleNoPlan.length === 0 ? (
                <EmptyRow text={noPlan.length === 0 ? "Every active driver has a trip on file in Alvys right now." : "No driver matches that search."} />
              ) : (
                visibleNoPlan.map((d) => (
                  <div key={d.id} style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 14, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--clg-navy)" }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 4 }}>{d.fleet_name || "No fleet on file"}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <SectionCard style={{ marginBottom: 26 }}>
              {visibleNoPlan.length === 0 ? (
                <EmptyRow text={noPlan.length === 0 ? "Every active driver has a trip on file in Alvys right now." : "No driver matches that search."} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                  <thead>
                    <tr>
                      {["Driver", "Fleet"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                          fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                          borderBottom: "2px solid var(--clg-border-default)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNoPlan.map((d, i) => (
                      <tr key={d.id} style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
                        <td style={{ padding: "11px 16px", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {d.name}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {d.fleet_name || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>
          )}

          <SectionHeader icon={<Clock size={15} color="var(--clg-royal)" />} title="Reload gap ahead" />
          {isMobile ? (
            <div style={{ marginBottom: 26 }}>
              {visibleGaps.length === 0 ? (
                <EmptyRow text={gapAhead.length === 0 ? "No delivering driver has a real gap before their next load." : "No driver or unit matches that search."} />
              ) : (
                visibleGaps.map((row) => (
                  <div
                    key={row.driver.id}
                    onClick={() => row.current.unit?.id && setOpenUnitId(row.current.unit.id)}
                    style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 14, marginBottom: 10, cursor: row.current.unit?.id ? "pointer" : "default" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--clg-navy)" }}>{row.driver.name}</div>
                        {row.current.unit?.number && <div style={{ fontSize: 12, color: "var(--clg-royal)", marginTop: 2 }}>Unit {row.current.unit.number}</div>}
                      </div>
                      <Badge tone={hoursUntil(row.deadline) < 6 ? "critical" : "accent"}>{fmtHoursUntil(row.deadline)}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>
                      {row.current.load_number ? `Load ${row.current.load_number} · ` : ""}{row.current.delivery_name || "Destination not synced"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>Delivers {fmtDeadline(row.deadline)}</div>
                    <div style={{ fontSize: 12, color: "var(--clg-scarlet)", marginTop: 6, fontWeight: 600 }}>{fmtGap(row.gapHours)}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <SectionCard style={{ marginBottom: 26 }}>
              {visibleGaps.length === 0 ? (
                <EmptyRow text={gapAhead.length === 0 ? "No delivering driver has a real gap before their next load." : "No driver or unit matches that search."} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                  <thead>
                    <tr>
                      {["Driver", "Unit", "Current load", "Delivers", "Next load", "Gap"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                          fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                          borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleGaps.map((row, i) => (
                      <tr
                        key={row.driver.id}
                        onClick={() => row.current.unit?.id && setOpenUnitId(row.current.unit.id)}
                        style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: row.current.unit?.id ? "pointer" : "default" }}
                      >
                        <td style={{ padding: "11px 16px", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {row.driver.name}
                        </td>
                        <td style={{ padding: "11px 16px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-royal)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {row.current.unit?.number || "—"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", maxWidth: 220 }}>
                          {row.current.load_number ? `Load ${row.current.load_number} · ` : ""}{row.current.delivery_name || "—"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-body)", borderBottom: "1px solid var(--clg-border-subtle)", fontFamily: "var(--clg-font-mono, monospace)" }}>
                          {fmtDeadline(row.deadline)}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", maxWidth: 200 }}>
                          {row.next ? `${row.next.load_number ? `Load ${row.next.load_number} · ` : ""}${row.next.pickup_name || "—"}` : "Nothing booked yet"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-scarlet)", fontWeight: 600, borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {fmtGap(row.gapHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>
          )}

          <SectionHeader icon={<TrendingDown size={15} color="var(--clg-ruby)" />} title="Long deadhead ahead" />
          {isMobile ? (
            <div>
              {visibleDeadheads.length === 0 ? (
                <EmptyRow text={highDeadhead.length === 0 ? `No queued load runs above the ${EMPTY_MILE_TARGET_PCT}% planned-empty-mile target.` : "No driver or unit matches that search."} />
              ) : (
                visibleDeadheads.map((row) => (
                  <div
                    key={`${row.driver.id}:${row.trip.alvys_trip_id}`}
                    onClick={() => row.trip.unit?.id && setOpenUnitId(row.trip.unit.id)}
                    style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 14, marginBottom: 10, cursor: row.trip.unit?.id ? "pointer" : "default" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--clg-navy)" }}>{row.driver.name}</div>
                        {row.trip.unit?.number && <div style={{ fontSize: 12, color: "var(--clg-royal)", marginTop: 2 }}>Unit {row.trip.unit.number}</div>}
                      </div>
                      <Badge tone="critical">{row.emptyMilePct.toFixed(1)}% empty</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>
                      {row.trip.load_number ? `Load ${row.trip.load_number} · ` : ""}{row.trip.pickup_name || "Pickup not synced"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
                      {Math.round(row.trip.empty_miles)} empty / {Math.round(row.trip.total_miles)} total mi
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <SectionCard>
              {visibleDeadheads.length === 0 ? (
                <EmptyRow text={highDeadhead.length === 0 ? `No queued load runs above the ${EMPTY_MILE_TARGET_PCT}% planned-empty-mile target.` : "No driver or unit matches that search."} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
                  <thead>
                    <tr>
                      {["Driver", "Unit", "Next load", "Pickup", "Empty / total mi", "Empty %"].map((h) => (
                        <th key={h} style={{
                          textAlign: h === "Empty %" ? "right" : "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                          fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                          borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDeadheads.map((row, i) => (
                      <tr
                        key={`${row.driver.id}:${row.trip.alvys_trip_id}`}
                        onClick={() => row.trip.unit?.id && setOpenUnitId(row.trip.unit.id)}
                        style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: row.trip.unit?.id ? "pointer" : "default" }}
                      >
                        <td style={{ padding: "11px 16px", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {row.driver.name}
                        </td>
                        <td style={{ padding: "11px 16px", fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-royal)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {row.trip.unit?.number || "—"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                          {row.trip.load_number || "—"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", maxWidth: 220 }}>
                          {row.trip.pickup_name || "—"}
                        </td>
                        <td style={{ padding: "11px 16px", color: "var(--clg-text-body)", borderBottom: "1px solid var(--clg-border-subtle)", fontFamily: "var(--clg-font-mono, monospace)" }}>
                          {Math.round(row.trip.empty_miles)} / {Math.round(row.trip.total_miles)}
                        </td>
                        <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)", textAlign: "right" }}>
                          <Badge tone="critical">{row.emptyMilePct.toFixed(1)}%</Badge>
                        </td>
                      </tr>
                    ))}
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
