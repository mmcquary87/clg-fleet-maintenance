import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { StatusPill, Select, Button } from "../../ds";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../hooks/useAuth";
import { useTripNotes } from "../../hooks/useTripNotes";

const NOTE_STATUS_OPTIONS = ["Checked OK", "Needs Follow-up", "Resolved"];
const NOTE_STATUS_TONE = { "Checked OK": "green", "Needs Follow-up": "yellow", "Resolved": "neutral" };

function textareaStyle() {
  return {
    width: "100%", boxSizing: "border-box", fontFamily: "var(--clg-font-body)", fontSize: 12.5,
    color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
    borderRadius: "var(--clg-radius-sm)", padding: "8px 10px", resize: "vertical",
  };
}

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
  if (eta.severity === "arrived") return <StatusPill tone="green">Arrived</StatusPill>;
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

function driverNameFor(row) {
  return row.trip.driver?.name || row.unit.driver_name || "Driver not on file";
}

function fmtNoteTime(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// CLGOS-only dispatcher triage tag + free-text log, separate from Alvys's
// own Dispatched/In Transit status -- Alvys exposes no way to write that
// back (read-only, see alvys-sync-active-trips), so this is a new signal
// dispatchers set themselves (2026-11-03), not an edit to the real status.
function DispatcherNotes({ alvysTripId, loadNumber, notes, onAddNote }) {
  const { session } = useAuth();
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!status && !note.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAddNote({
        alvysTripId, loadNumber, status: status || null, note: note.trim() || null,
        createdBy: session?.user?.email ?? "Unknown",
      });
      setStatus("");
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 12, borderTop: "1px solid var(--clg-border-subtle)", paddingTop: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 8 }}>
        Dispatcher notes
      </div>

      {notes.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginBottom: 10 }}>No notes yet.</div>
      ) : (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {n.status && <StatusPill tone={NOTE_STATUS_TONE[n.status] || "neutral"}>{n.status}</StatusPill>}
                <span style={{ color: "var(--clg-text-muted)", fontSize: 11 }}>{n.created_by} · {fmtNoteTime(n.created_at)}</span>
              </div>
              {n.note && <div style={{ color: "var(--clg-granite)", marginTop: 2 }}>{n.note}</div>}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "var(--clg-ruby)", marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={NOTE_STATUS_OPTIONS} placeholder="No status change" />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Called driver — running 30 min behind due to traffic"
          rows={2}
          style={textareaStyle()}
        />
        <Button size="sm" onClick={submit} disabled={submitting || (!status && !note.trim())} style={{ alignSelf: "flex-start" }}>
          {submitting ? <Loader2 size={13} className="spin" /> : "Add note"}
        </Button>
      </div>
    </div>
  );
}

function Row({ row, zebra, onOpenUnit, notesFor, latestStatusFor, onAddNote }) {
  const [open, setOpen] = useState(false);
  const { unit, trip, eta } = row;
  const driverName = driverNameFor(row);
  const bg = zebra ? "var(--clg-surface-subtle)" : "transparent";
  const latestStatus = latestStatusFor(trip.alvys_trip_id);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", background: bg, borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}
      >
        <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "var(--clg-navy)" }}>
          {driverName}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenUnit(unit.id); }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--clg-royal)", textDecoration: "underline" }}
          >
            {unit.number}
          </button>
        </td>
        <td style={{ padding: "10px 8px", fontSize: 13 }}>
          {trip.load_number ? (
            <a
              href={`https://app.alvys.com/#/loads/${trip.load_number}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--clg-royal)", textDecoration: "underline" }}
            >
              {trip.load_number}
            </a>
          ) : (
            <span style={{ color: "var(--clg-mercury)" }}>—</span>
          )}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-granite)", maxWidth: 160 }}>
          {unit.current_location || <span style={{ color: "var(--clg-mercury)" }}>No GPS lock</span>}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-granite)", maxWidth: 160 }}>
          {eta.stopLabel && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: eta.stopType === "Pickup" ? "var(--clg-royal)" : "var(--clg-navy)" }}>
              {eta.stopLabel}
            </div>
          )}
          {trip.stop_name || "Not yet synced"}
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
        <td style={{ padding: "10px 8px" }}>
          <StatusCell eta={eta} />
          {latestStatus && (
            <div style={{ marginTop: 4 }}>
              <StatusPill tone={NOTE_STATUS_TONE[latestStatus] || "neutral"} style={{ fontSize: 10 }}>{latestStatus}</StatusPill>
            </div>
          )}
        </td>
        <td style={{ padding: "10px 8px", width: 20 }}>
          <ChevronDown size={14} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ background: bg, borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={11} style={{ padding: "0 8px 14px", fontSize: 12.5, color: "var(--clg-granite)" }}>
            <div style={{ background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px", lineHeight: 1.6 }}>
              {eta.reason}
              <DispatcherNotes
                alvysTripId={trip.alvys_trip_id}
                loadNumber={trip.load_number}
                notes={notesFor(trip.alvys_trip_id)}
                onAddNote={onAddNote}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const HEADERS = [
  "Driver", "Unit", "Load #", "Current location", "Stop", "ETA", "Appt", "ETA Cushion", "HOS", "Miles remaining", "Status", "",
];

function statusTone(eta) {
  if (eta.severity === "attention") return "red";
  if (eta.severity === "arrived" || (eta.severity === "ok" && eta.hasAppointment)) return "green";
  return "pending";
}

// Phone-width card, one per driver — same fields as a table row, stacked
// instead of scrolled horizontally. A wide 11-column table is unusable
// below ~700px, so this isn't a squeezed table, it's a different layout.
function DriverCard({ row, onOpenUnit, notesFor, latestStatusFor, onAddNote }) {
  const [open, setOpen] = useState(false);
  const { unit, trip, eta } = row;
  const driverName = driverNameFor(row);
  const latestStatus = latestStatusFor(trip.alvys_trip_id);

  return (
    <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>{driverName}</div>
          <button
            onClick={() => onOpenUnit(unit.id)}
            style={{ background: "none", border: "none", padding: 0, marginTop: 2, cursor: "pointer", font: "inherit", fontSize: 12, color: "var(--clg-royal)", textDecoration: "underline" }}
          >
            Unit {unit.number}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <StatusPill tone={statusTone(eta)}>
            {eta.severity === "attention" ? "Late risk" : eta.severity === "arrived" ? "Arrived" : eta.severity === "ok" && eta.hasAppointment ? "On track" : eta.severity === "ok" ? "No appt" : "Missing data"}
          </StatusPill>
          {latestStatus && <StatusPill tone={NOTE_STATUS_TONE[latestStatus] || "neutral"} style={{ fontSize: 10 }}>{latestStatus}</StatusPill>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, fontSize: 12.5 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Stop</div>
          <div style={{ color: "var(--clg-granite)", marginTop: 2 }}>{trip.stop_name || "Not yet synced"}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>ETA cushion</div>
          <div style={{ marginTop: 2 }}><CushionPill eta={eta} /></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>HOS</div>
          <div style={{ marginTop: 2 }}><HosCell hos={row.hos} eta={eta} /></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Miles remaining</div>
          <div style={{ color: "var(--clg-granite)", marginTop: 2 }}>{eta.distanceRemainingMiles != null ? Math.round(eta.distanceRemainingMiles).toLocaleString() : "—"}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11.5, color: "var(--clg-text-muted)" }}>
        <span>{unit.current_location || "No GPS lock"}</span>
        {trip.load_number && (
          <a href={`https://app.alvys.com/#/loads/${trip.load_number}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--clg-royal)" }}>
            Load {trip.load_number}
          </a>
        )}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{ marginTop: 10, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--clg-royal)" }}
      >
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} /> Why this ETA / notes
      </button>
      {open && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--clg-granite)", lineHeight: 1.6 }}>
          {eta.reason}
          <DispatcherNotes
            alvysTripId={trip.alvys_trip_id}
            loadNumber={trip.load_number}
            notes={notesFor(trip.alvys_trip_id)}
            onAddNote={onAddNote}
          />
        </div>
      )}
    </div>
  );
}

// One dense table for every driver on an active load (ui-improvement-
// punch-list.md's Tracking rebuild) — replaces the old three-section
// split (Needs attention/On track/Missing data). Rows already arrive
// worst-first from useTracking (attention's negative cushion, then
// onTrack's positive cushion, then noData last), so the whole table reads
// as one continuous risk gradient instead of three separately-sorted
// lists. Driver is the primary identity (leftmost column / card title) —
// unit is still one tap away for maintenance/DVIR history, but the person
// dispatchers are actually managing here is the driver, not the truck.
// Below the mobile breakpoint this renders as a card list instead — an
// 11-column table doesn't fit a phone screen no matter how it's squeezed.
export default function TrackingTable({ rows, onOpenUnit }) {
  const isMobile = useIsMobile();
  const { notesFor, latestStatusFor, addNote } = useTripNotes();

  if (isMobile) {
    return (
      <div>
        {rows.map((row) => (
          <DriverCard key={row.unit.id} row={row} onOpenUnit={onOpenUnit} notesFor={notesFor} latestStatusFor={latestStatusFor} onAddNote={addNote} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
            {HEADERS.map((h, i) => (
              <th key={h || i} style={{
                textAlign: i === 9 ? "right" : "left", padding: "0 8px 8px", fontFamily: "var(--clg-font-heading)",
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)", whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <Row key={row.unit.id} row={row} zebra={i % 2 === 1} onOpenUnit={onOpenUnit} notesFor={notesFor} latestStatusFor={latestStatusFor} onAddNote={addNote} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
