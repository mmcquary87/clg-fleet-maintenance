import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Download, Thermometer, MapPin } from "lucide-react";
import { Card, Button, StatusPill, Eyebrow, Select, Input } from "../../ds";
import { useAlvysCheckCalls } from "../../hooks/useAlvysCheckCalls";
import { supabase } from "../../lib/supabaseClient";
import { CATEGORIES } from "../../lib/categories";
import {
  groupByTrip, sortByStaleness, boardSummary, isStale, stalenessHours,
  MILES_TO_DRIVE_TIME, MILES_TO_DRIVE_TIME_MPH, fmtHoursAsClock,
} from "../../lib/alvysCheckCalls";
import { downloadCsv } from "../../lib/exportCsv";

function fmtClock(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtGap(hours) {
  if (hours === Infinity) return "no call on file";
  return hours < 1 ? `${Math.round(hours * 60)}m ago` : `${hours.toFixed(1)}h ago`;
}

function RaiseWorkOrderInline({ call, unitId, onDone }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState(call.description || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (done) return <div style={{ fontSize: 11.5, color: "var(--clg-royal)", fontWeight: 600 }}>Work order raised.</div>;
  if (!unitId) return null;

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11.5, color: "var(--clg-royal)", fontWeight: 600, textDecoration: "underline" }}
      >
        Raise a work order from this note
      </button>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("work_orders").insert({
      unit_id: unitId,
      category,
      complaint: description.trim() || call.description || "Reported on a check call",
      severity: "Routine",
      status: "Open-Proposed",
      intake_source: "manual",
      source: "manual",
      date_opened: new Date().toISOString().slice(0, 10),
      alvys_check_call_id: call.id,
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    onDone?.();
  };

  return (
    <div style={{ marginTop: 8, border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 10, display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
      {error && <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)" }}>{error}</div>}
      <Select value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's wrong" />
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" onClick={submit} disabled={submitting} iconLeft={submitting ? <Loader2 size={13} className="spin" /> : null}>Raise work order</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
      </div>
    </div>
  );
}

function CallHistory({ trip, onRaised }) {
  if (trip.calls.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>No check calls logged in Alvys for this trip yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[...trip.calls].reverse().map((c) => (
        <div key={c.id} style={{ fontSize: 12.5, color: "var(--clg-text-body)", borderBottom: "1px solid var(--clg-border-subtle)", paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--clg-navy)" }}>{fmtClock(new Date(c.created_at))}</span>
            {c.response_type && <StatusPill tone={c.response_type === "No Answer" ? "red" : "green"}>{c.response_type}</StatusPill>}
          </div>
          <div style={{ marginTop: 4 }}>{c.description || <span style={{ color: "var(--clg-text-muted)" }}>No note</span>}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4, fontSize: 11, color: "var(--clg-text-muted)" }}>
            {c.location_address && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {c.location_address}</span>}
            {(c.reefer_setpoint_temp != null || c.reefer_return_temp != null) && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Thermometer size={11} /> Setpoint {c.reefer_setpoint_temp ?? "—"}° / Return {c.reefer_return_temp ?? "—"}°
              </span>
            )}
            {c.created_by && <span>by {c.created_by}</span>}
          </div>
          <div style={{ marginTop: 6 }}>
            <RaiseWorkOrderInline call={c} unitId={trip.unitId} onDone={onRaised} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TripRow({ trip, zebra, onRaised }) {
  const [open, setOpen] = useState(false);
  const bg = zebra ? "var(--clg-surface-subtle)" : "transparent";
  const gapHours = stalenessHours(trip.lastCall);
  const stale = isStale(trip);

  return (
    <>
      <tr onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer", background: bg, borderBottom: open ? "none" : "1px solid var(--clg-smoke)" }}>
        <td style={{ padding: "10px 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--clg-navy)" }}>{trip.driverName || "Driver not on file"}</div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>Truck {trip.unitNumber || "—"} · Load {trip.loadNumber || "—"}</div>
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5, color: "var(--clg-text-body)", maxWidth: 280 }}>
          {trip.lastCall ? (
            <>
              {trip.lastCall.response_type && <span style={{ fontWeight: 600 }}>{trip.lastCall.response_type} — </span>}
              {trip.lastCall.description || <span style={{ color: "var(--clg-text-muted)" }}>No note</span>}
            </>
          ) : (
            <span style={{ color: "var(--clg-text-muted)" }}>Nothing logged yet</span>
          )}
        </td>
        <td style={{ padding: "10px 8px", fontSize: 12.5 }}>
          {trip.lastCall ? fmtClock(new Date(trip.lastCall.created_at)) : "—"}
        </td>
        <td style={{ padding: "10px 8px" }}>
          <StatusPill tone={!trip.lastCall ? "neutral" : stale ? "red" : "green"}>{fmtGap(gapHours)}</StatusPill>
        </td>
        <td style={{ padding: "10px 8px", width: 20 }}>
          <ChevronDown size={14} color="var(--clg-cool)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .12s" }} />
        </td>
      </tr>
      {open && (
        <tr style={{ background: bg, borderBottom: "1px solid var(--clg-smoke)" }}>
          <td colSpan={5} style={{ padding: "0 8px 14px" }}>
            <div style={{ background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)", padding: "12px 14px" }}>
              <CallHistory trip={trip} onRaised={onRaised} />
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

// Real Alvys check-call history, read-only (CLG's own spec: CLG OS reads
// check calls, it never logs them into Alvys). Dispatchers already log
// every call in Alvys's own Check Calls panel -- this surfaces that data
// here instead of asking them to log it a second time.
export default function CheckCallBoard() {
  const { activeTrips, checkCalls, loading, error, reload } = useAlvysCheckCalls();
  const [query, setQuery] = useState("");

  const trips = useMemo(() => sortByStaleness(groupByTrip(activeTrips, checkCalls)), [activeTrips, checkCalls]);
  const visibleTrips = useMemo(() => {
    if (!query.trim()) return trips;
    const q = query.trim().toLowerCase();
    return trips.filter((t) => (t.driverName || "").toLowerCase().includes(q) || (t.unitNumber || "").toLowerCase().includes(q));
  }, [trips, query]);
  const summary = useMemo(() => boardSummary(trips), [trips]);

  const exportCsv = () => {
    downloadCsv(`check-calls-${new Date().toISOString().slice(0, 10)}.csv`, checkCalls, [
      { label: "Trip", value: (r) => r.trip_number },
      { label: "Load", value: (r) => r.load_number },
      { label: "Driver", value: (r) => r.driver_name },
      { label: "Logged at", value: (r) => new Date(r.created_at).toLocaleString() },
      { label: "Status", value: (r) => r.response_type },
      { label: "Note", value: (r) => r.description },
      { label: "Location", value: (r) => r.location_address },
      { label: "Logged by", value: (r) => r.created_by },
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
          <h2 style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, marginTop: 4 }}>Check calls</h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 560 }}>
            Real check-call history from Alvys, synced every 15 minutes — read-only. Dispatchers keep logging calls in Alvys same as always; nothing here writes back.
          </p>
        </div>
        <Button variant="outline" size="sm" iconLeft={<Download size={13} />} onClick={exportCsv}>Export</Button>
      </div>

      {error && <div style={{ color: "var(--clg-scarlet)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      {trips.length === 0 ? (
        <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, border: "1px dashed var(--clg-mercury)", borderRadius: "var(--clg-radius-md)" }}>
          No active trips right now.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            <KpiTile value={trips.length} label="active trips" detail="Every currently dispatched or in-transit load." />
            <KpiTile
              value={summary.neverCalled.length}
              valueColor={summary.neverCalled.length > 0 ? "var(--clg-scarlet)" : undefined}
              label="no check call on file"
              detail={summary.neverCalled.length > 0 ? summary.neverCalled.map((t) => `${t.driverName || "Driver not on file"}, truck ${t.unitNumber || "—"}`).join("; ") : "Every active trip has at least one call logged."}
            />
            <KpiTile
              value={summary.stale.length}
              valueColor={summary.stale.length > 0 ? "var(--clg-scarlet)" : undefined}
              label="stale — no recent call"
              detail="No check call logged in over 2 hours."
            />
          </div>

          <div style={{ marginBottom: 12, maxWidth: 320 }}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Look up a driver or unit…" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
            <Card padding={0}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--clg-border-default)" }}>
                      {["Driver", "Last activity", "Last call", "Since", ""].map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "10px 8px 8px", fontFamily: "var(--clg-font-heading)", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrips.map((trip, i) => (
                      <TripRow key={trip.tripId} trip={trip} zebra={i % 2 === 1} onRaised={reload} />
                    ))}
                  </tbody>
                </table>
              </div>
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
        </>
      )}
    </div>
  );
}
