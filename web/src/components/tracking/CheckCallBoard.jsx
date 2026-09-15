import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Phone, Download } from "lucide-react";
import { Card, Button, StatusPill, Eyebrow } from "../../ds";
import { useAuth } from "../../hooks/useAuth";
import { useProfile } from "../../hooks/useProfile";
import { useCheckCalls } from "../../hooks/useCheckCalls";
import {
  coverageFor, boardSummary, mostOverdue, initialsFor,
  MILES_TO_DRIVE_TIME, MILES_TO_DRIVE_TIME_MPH, fmtHoursAsClock,
} from "../../lib/checkCallBoard";
import { downloadCsv } from "../../lib/exportCsv";
import LogCallPanel from "./LogCallPanel";

function fmtClock(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtHourTick(date) {
  const h = date.getHours();
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function fmtGap(ms) {
  if (ms === Infinity) return "never called";
  const hours = ms / 3600000;
  return hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(1)}h`;
}

const CELL_TONE = {
  called: "var(--clg-royal)",
  missed: "var(--clg-scarlet)",
  not_due: "var(--clg-mercury)",
  off_duty: "var(--clg-smoke)",
};

const CELL_LABEL = {
  called: "Called",
  missed: "Hour passed, no call",
  not_due: "Not due yet",
  off_duty: "Off duty",
};

// The board's row set is the union of who's currently on an active load
// (useTracking's rows -- the same live Alvys data feeding the ETA table
// above) and anyone with a call logged today, so a driver who delivered
// mid-day and dropped off the live list doesn't also vanish from their
// own coverage history.
function buildBoards(trackingRows, calls) {
  const byUnit = new Map();

  for (const r of trackingRows) {
    byUnit.set(r.unit.id, {
      unitId: r.unit.id,
      unitNumber: r.unit.number,
      driverId: r.trip.driver?.id ?? null,
      driverName: r.trip.driver?.name || r.unit.driver_name || "Driver not on file",
      alvysTripId: r.trip.alvys_trip_id,
      loadNumber: r.trip.load_number,
    });
  }
  for (const c of calls) {
    if (byUnit.has(c.unit_id)) continue;
    byUnit.set(c.unit_id, {
      unitId: c.unit_id,
      unitNumber: c.unit_number,
      driverId: c.driver_id,
      driverName: c.driver_name || "Driver not on file",
      alvysTripId: c.alvys_trip_id,
      loadNumber: c.load_number,
    });
  }

  return [...byUnit.values()]
    .map((base) => {
      const unitCalls = calls.filter((c) => c.unit_id === base.unitId);
      return { ...base, calls: unitCalls, coverage: coverageFor(unitCalls) };
    })
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}

function CoverageGrid({ cells }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {cells.map((c, i) => (
        <div
          key={i}
          title={`${fmtHourTick(c.hour)} — ${c.state === "called" ? `Called ${fmtClock(new Date(c.call.logged_at))} by ${c.call.logged_by}` : CELL_LABEL[c.state]}`}
          style={{ width: 8, height: 16, borderRadius: 2, background: CELL_TONE[c.state] }}
        />
      ))}
    </div>
  );
}

function CallThread({ board }) {
  if (board.calls.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>No calls logged for this driver today.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {board.calls.map((c) => (
        <div key={c.id} style={{ fontSize: 12.5, color: "var(--clg-text-body)", display: "flex", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "var(--clg-navy)", flexShrink: 0 }}>
            {initialsFor(c.logged_by)} {fmtClock(new Date(c.logged_at))}
          </span>
          <span>
            {c.off_duty && <StatusPill tone="neutral" style={{ marginRight: 6 }}>Off duty</StatusPill>}
            {c.note}
            {c.free_time_expires_at && (
              <span style={{ color: "var(--clg-scarlet)", fontWeight: 600 }}> · Free time expires {fmtClock(new Date(c.free_time_expires_at))}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function DriverRow({ board, zebra, onLogCall }) {
  const [open, setOpen] = useState(false);
  const bg = zebra ? "var(--clg-surface-subtle)" : "transparent";
  const { coverage } = board;

  return (
    <>
      <tr onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer", background: bg, borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}>
        <td style={{ padding: "10px 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--clg-navy)" }}>{board.driverName}</div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>Truck {board.unitNumber || "—"}</div>
        </td>
        <td style={{ padding: "10px 8px" }}><CoverageGrid cells={coverage.cells} /></td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-navy)" }}>
          {coverage.lastCall ? fmtClock(new Date(coverage.lastCall.logged_at)) : <span style={{ color: "var(--clg-scarlet)", fontWeight: 600 }}>No call today</span>}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--clg-text-muted)" }}>
          {coverage.lastCall ? initialsFor(coverage.lastCall.logged_by) : "—"}
        </td>
        <td style={{ padding: "10px 8px" }}>
          <Button variant="outline" size="sm" iconLeft={<Phone size={12} />} onClick={(e) => { e.stopPropagation(); onLogCall(board); }}>
            Log
          </Button>
        </td>
        <td style={{ padding: "10px 8px", width: 20 }}>
          <ChevronDown size={14} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ background: bg, borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={6} style={{ padding: "0 8px 14px" }}>
            <div style={{ background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px" }}>
              <CallThread board={board} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function KpiTile({ value, valueColor, label, detail }) {
  return (
    <Card padding={16}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 28, lineHeight: 1, color: valueColor || "var(--clg-navy)" }}>{value}</span>
        <span style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>{label}</span>
      </div>
      {detail && <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 6, lineHeight: 1.5 }}>{detail}</div>}
    </Card>
  );
}

// The check-call board: hourly proof-of-contact logging for every driver
// on today's Tracking list, in the same tab as the live GPS/ETA/HOS data
// (CLG, 2026-09-15: "bring the GPS/ETA/HOS data into this and have it all
// combined into 1 tab"). `trackingRows` is useTracking's row list, reused
// as the board's row set rather than re-derived.
export default function CheckCallBoard({ trackingRows }) {
  const { session } = useAuth();
  const { profile } = useProfile(session?.user?.id);
  const { calls, loading, error, reload } = useCheckCalls();
  const [activeBoard, setActiveBoard] = useState(null);
  const [offDutyMode, setOffDutyMode] = useState(false);

  const loggedByName = profile?.full_name || session?.user?.email || "Dispatcher";

  const boards = useMemo(() => buildBoards(trackingRows, calls), [trackingRows, calls]);
  const summary = useMemo(() => boardSummary(boards), [boards]);
  const overdue = useMemo(() => mostOverdue(boards), [boards]);

  const openLogCall = (board, asOffDuty = false) => {
    setOffDutyMode(asOffDuty);
    setActiveBoard(board);
  };

  const exportDay = () => {
    const rows = [...calls].sort((a, b) => (a.driver_name || "").localeCompare(b.driver_name || "") || a.logged_at.localeCompare(b.logged_at));
    downloadCsv(`check-calls-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { label: "Driver", value: (r) => r.driver_name },
      { label: "Unit", value: (r) => r.unit_number },
      { label: "Hour", value: (r) => fmtHourTick(new Date(r.call_hour)) },
      { label: "Logged at", value: (r) => new Date(r.logged_at).toLocaleString() },
      { label: "By", value: (r) => r.logged_by },
      { label: "Off duty", value: (r) => (r.off_duty ? "Yes" : "") },
      { label: "Free time expires", value: (r) => (r.free_time_expires_at ? new Date(r.free_time_expires_at).toLocaleTimeString() : "") },
      { label: "Note", value: (r) => r.note },
    ]);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading check calls…
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Tracking</Eyebrow>
          <h2 style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, marginTop: 4 }}>Check-call board</h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 520 }}>
            Every driver above is called once an hour and the call is logged against the hour it covers. A gap in a row is a driver nobody has spoken to.
          </p>
        </div>
        <Button variant="outline" size="sm" iconLeft={<Download size={13} />} onClick={exportDay}>Export day</Button>
      </div>

      {error && <div style={{ color: "var(--clg-scarlet)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      {boards.length === 0 ? (
        <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, border: "1px dashed var(--clg-mercury)", borderRadius: "var(--clg-radius-md)" }}>
          Nobody's on an active load right now, so there's nothing to call yet today.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            <KpiTile
              value={`${summary.fullyCovered} of ${summary.total}`}
              label="drivers fully covered"
              detail="Every due hour of the shift so far has a logged call."
            />
            <KpiTile
              value={summary.neverCalled.length}
              valueColor={summary.neverCalled.length > 0 ? "var(--clg-scarlet)" : undefined}
              label="never called today"
              detail={summary.neverCalled.length > 0 ? summary.neverCalled.map((b) => `${b.driverName}, truck ${b.unitNumber || "—"}`).join("; ") : "Everyone's had at least one call logged."}
            />
            <KpiTile
              value={summary.detentionSoon.length}
              valueColor={summary.detentionSoon.length > 0 ? "var(--clg-scarlet)" : undefined}
              label="free time expiring within the hour"
              detail={summary.detentionSoon.length > 0 ? summary.detentionSoon.map((x) => `${x.board.driverName} ${fmtClock(x.expiresAt)}`).join("; ") : "No detention clocks running down."}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
            <Card padding={0}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
                      {["Driver", "Hourly coverage", "Last call", "By", "", ""].map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "10px 8px 8px", fontFamily: "var(--clg-font-heading)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boards.map((board, i) => (
                      <DriverRow key={board.unitId} board={board} zebra={i % 2 === 1} onLogCall={(b) => openLogCall(b, false)} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 16, padding: "10px 16px", fontSize: 11, color: "var(--clg-text-muted)" }}>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CELL_TONE.called, marginRight: 5 }} />Called</span>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CELL_TONE.missed, marginRight: 5 }} />Hour passed, no call</span>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CELL_TONE.not_due, marginRight: 5 }} />Not due yet</span>
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {overdue ? (
                <Card style={{ borderTop: "3px solid var(--clg-scarlet)" }}>
                  <Eyebrow style={{ color: "var(--clg-scarlet)" }}>Call now</Eyebrow>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                    <div style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{overdue.board.driverName} · truck {overdue.board.unitNumber || "—"}</div>
                    <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 20, color: "var(--clg-scarlet)" }}>{fmtGap(overdue.gapMs)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 6 }}>
                    {overdue.board.coverage.neverCalledToday ? "No call logged for this driver yet today." : `${overdue.board.coverage.missedCount} hour${overdue.board.coverage.missedCount === 1 ? "" : "s"} passed today with no call.`}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                    <Button size="sm" iconLeft={<Phone size={13} />} onClick={() => openLogCall(overdue.board, false)}>Log a call</Button>
                    <Button variant="quiet" size="sm" onClick={() => openLogCall(overdue.board, true)}>Mark off duty</Button>
                  </div>
                </Card>
              ) : (
                <Card>
                  <Eyebrow tone="brand">Call now</Eyebrow>
                  <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 6 }}>Every driver is covered through this hour.</div>
                </Card>
              )}

              <Card>
                <Eyebrow>Detention clocks</Eyebrow>
                {summary.detentionSoon.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 6 }}>No free-time clocks running down in the next 60 minutes.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                    {summary.detentionSoon.map((x) => (
                      <div key={x.board.unitId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                        <span>{x.board.driverName} · {x.board.unitNumber || "—"}</span>
                        <span style={{ fontWeight: 700, color: "var(--clg-scarlet)" }}>{fmtClock(x.expiresAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <Eyebrow>Miles to drive time</Eyebrow>
                <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 2 }}>{MILES_TO_DRIVE_TIME_MPH} mph flat</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                  {MILES_TO_DRIVE_TIME.map((r) => (
                    <div key={r.miles} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                      <span style={{ color: "var(--clg-text-muted)" }}>{r.miles} mi</span>
                      <span style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{fmtHoursAsClock(r.hours)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                  Assumes a flat {MILES_TO_DRIVE_TIME_MPH} mph with no stops — optimistic past about eight hours, where breaks and the 14-hour limit start to bind.
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {activeBoard && (
        <LogCallPanel
          board={activeBoard}
          loggedByName={loggedByName}
          initialOffDuty={offDutyMode}
          onClose={() => setActiveBoard(null)}
          onSaved={() => { setActiveBoard(null); reload(); }}
        />
      )}
    </div>
  );
}
