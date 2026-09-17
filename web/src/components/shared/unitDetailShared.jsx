import { useEffect, useState } from "react";
import { Mail, Loader2, Save } from "lucide-react";
import { Badge, Input, Select, Button } from "../../ds";
import { useVendors } from "../../hooks/useVendors";
import { MILESTONES, nextDueDate, dueStatus } from "../../lib/maintenanceSchedule";
import { buildMailto } from "../../lib/mailto";

// Pieces shared between UnitDrawer (the quick-glance panel used from
// Board/Tracking/Work Orders) and UnitDetailPage (the full Units-page
// view) -- extracted here so both read from one implementation instead of
// two copies drifting apart.

export function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function fmtHM(minutes) {
  if (typeof minutes !== "number") return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

export function fmtFull(value) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function statusTone(status) {
  if (status === "overdue") return "critical";
  if (status === "due_soon") return "accent";
  if (status === "ok") return "brand";
  return "neutral";
}

export function statusLabel(status) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "ok") return "On track";
  return "Not set";
}

// The Annual Inspection milestone is entirely manual -- last_annual_
// inspection_date only updates when someone closes an "Annual" work order
// in this app, so it can silently disagree with the real expiration on
// file in Alvys. This surfaces that real answer alongside it rather than
// replacing the milestone tracker (see useUnitDetail.js for the query).
// basis='alvys_field' (current) reads InspectionExpirationDate/
// InspectionExpiresAt straight off the unit's own Alvys record --
// basis='alvys_certificate' is the older, less reliable source (a date
// parsed out of an uploaded document's free-text label) that's being
// phased out as alvys-sync-equipment re-syncs each unit onto the newer
// basis; still handled here so a not-yet-re-synced unit shows something.
export function alvysDotInspectionNote(maintenanceDue) {
  const row = (maintenanceDue ?? []).find((d) => d.kind === "dot_inspection");
  if (!row) return null;
  if (row.basis === "alvys_field" && row.due_date) {
    return { tone: "brand", text: `Alvys — expires ${row.due_date}` };
  }
  if (row.basis === "alvys_certificate" && row.due_date) {
    return { tone: "brand", text: `Alvys certificate on file — expires ${row.due_date}` };
  }
  if (row.basis === "no_document_on_file") {
    return { tone: "critical", text: "No DOT inspection document found on file in Alvys" };
  }
  return null;
}

// The real due date to show for "Next due" -- prefers Alvys's own answer
// over computing one from the manual last_annual_inspection_date/365-day
// fields, since those are usually empty (nothing in this app requires
// filling them in) while Alvys's real expiration is now reliably synced.
export function alvysDotDueDate(maintenanceDue) {
  const row = (maintenanceDue ?? []).find((d) => d.kind === "dot_inspection" && (d.basis === "alvys_field" || d.basis === "alvys_certificate"));
  return row?.due_date ?? null;
}

// Mid-Trip's real next-due date from Alvys, same pattern/reasoning as the
// DOT inspection note above -- last_midtrip_date only updates when a
// mid-trip inspection is filed in this app (or a "DOT Inspection" work
// order tagged inspectionType "Midtrip" is closed), so a unit CLG has
// been tracking in Alvys but never yet inspected here shows nothing
// without this.
export function alvysMidtripNote(maintenanceDue) {
  const row = (maintenanceDue ?? []).find((d) => d.kind === "midtrip" && d.basis === "alvys_field" && d.due_date);
  if (!row) return null;
  return { tone: "brand", text: `Alvys — next due ${row.due_date}` };
}

export function alvysMidtripDueDate(maintenanceDue) {
  const row = (maintenanceDue ?? []).find((d) => d.kind === "midtrip" && d.basis === "alvys_field");
  return row?.due_date ?? null;
}

// PM/Oil is odometer-based in Alvys (no due-date concept there at all),
// unlike this app's own date+interval "pm" milestone -- shown as an
// independent note with its own odometer-based status rather than forced
// into the date-based "Next due" column. unit.odometer is the Samsara-
// synced current reading (same field UnitsView/UnitDetailPage already
// show), so this stays live between Alvys syncs.
export function alvysPmNote(maintenanceDue, unit) {
  const row = (maintenanceDue ?? []).find((d) => d.kind === "oil_change" && d.basis === "alvys_field" && d.due_odometer != null);
  if (!row) return null;
  const current = unit.odometer;
  const remaining = current != null ? row.due_odometer - current : null;
  const tone = remaining == null ? "neutral" : remaining < 0 ? "critical" : remaining <= 2500 ? "accent" : "brand";
  const text = current != null
    ? `Alvys — due at ${row.due_odometer.toLocaleString()} mi (now ${current.toLocaleString()} mi)`
    : `Alvys — due at ${row.due_odometer.toLocaleString()} mi`;
  return { tone, text };
}

export function MilestoneRow({ milestone, unit, onSave, saving, dueOverride }) {
  const interval = milestone.fixedInterval ?? unit[milestone.intervalField];
  const [lastDate, setLastDate] = useState(unit[milestone.lastField] || "");
  const [intervalDays, setIntervalDays] = useState(milestone.intervalField ? (unit[milestone.intervalField] ?? "") : "");

  useEffect(() => {
    setLastDate(unit[milestone.lastField] || "");
    setIntervalDays(milestone.intervalField ? (unit[milestone.intervalField] ?? "") : "");
  }, [unit, milestone]);

  // dueOverride (a real answer from Alvys, when we have one) wins over the
  // computed last-done + interval date -- that computation only produces
  // a real value once someone's filled in "Last done" here manually,
  // which most units never get, while Alvys's own answer is reliably synced.
  const computedNext = nextDueDate(unit[milestone.lastField], interval);
  const next = dueOverride ?? computedNext;
  const status = dueStatus(next);

  const dirty = lastDate !== (unit[milestone.lastField] || "")
    || (milestone.intervalField && String(intervalDays) !== String(unit[milestone.intervalField] ?? ""));

  const save = () => {
    const fields = { [milestone.lastField]: lastDate || null };
    if (milestone.intervalField) fields[milestone.intervalField] = intervalDays === "" ? null : Number(intervalDays);
    onSave(fields);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px", alignItems: "end", padding: "10px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ gridColumn: "1 / -1", fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5, color: "var(--clg-text-heading)" }}>
        {milestone.label}
      </div>
      <div>
        <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Last done</div>
        <Input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
      </div>
      {milestone.intervalField ? (
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Interval (days)</div>
          <Input type="number" min="1" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} placeholder="e.g. 90" />
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Interval (fixed)</div>
          <div style={{ fontSize: 13, color: "var(--clg-text-body)", padding: "11px 0" }}>{milestone.fixedInterval} days</div>
        </div>
      )}
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--clg-text-muted)" }}>Next due</span>
          <span style={{ fontSize: 13, fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-body)" }}>{next || "—"}</span>
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
        </div>
        <button
          type="button" onClick={save} disabled={!dirty || saving}
          title="Save"
          style={{
            background: "none", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)",
            cursor: dirty ? "pointer" : "not-allowed", opacity: dirty ? 1 : 0.35, padding: "6px 9px",
            display: "inline-flex", alignItems: "center", color: "var(--clg-royal)",
          }}
        >
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
        </button>
      </div>
    </div>
  );
}

export function MaintenanceSchedule({ unit, maintenanceDue, onSave, saving }) {
  return (
    <>
      {MILESTONES.map((m) => {
        const isAnnual = m.key === "annual";
        const isMidtrip = m.key === "midtrip";
        const isPm = m.key === "pm";
        const note = isAnnual ? alvysDotInspectionNote(maintenanceDue)
          : isMidtrip ? alvysMidtripNote(maintenanceDue)
          : isPm ? alvysPmNote(maintenanceDue, unit)
          : null;
        const dueOverride = unit[m.lastField] ? null
          : isAnnual ? alvysDotDueDate(maintenanceDue)
          : isMidtrip ? alvysMidtripDueDate(maintenanceDue)
          : null;
        return (
          <div key={m.key}>
            <MilestoneRow milestone={m} unit={unit} onSave={onSave} saving={saving} dueOverride={dueOverride} />
            {note && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 0", fontSize: 12 }}>
                <Badge tone={note.tone}>Alvys</Badge>
                <span style={{ color: "var(--clg-text-muted)" }}>{note.text}</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function WorkOrderHistory({ orders }) {
  if (orders.length === 0) {
    return (
      <div style={{ padding: "16px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
        No work orders logged for this unit yet.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {orders.map((o) => (
        <div key={o.id} style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>
              {o.category}
              {o.is_chargeback && <Badge tone="critical" style={{ marginLeft: 6 }}>Chargeback</Badge>}
            </span>
            <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 12.5 }}>{money(o.cost)}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 3 }}>
            {o.complaint || o.description || "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
            <span>{o.vendor?.name || "No vendor on file"} · {o.status}</span>
            <span>{o.date_closed || "Open"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CurrentLoadSection({ trip, hos }) {
  if (!trip && !hos) {
    return (
      <div style={{ padding: "10px 0", fontSize: 12.5, color: "var(--clg-text-muted)" }}>
        Not currently on an active load.
      </div>
    );
  }
  const deadline = trip?.delivery_window_end || trip?.delivery_appointment_at || null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
      {trip && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--clg-text-muted)" }}>Load</span>
            <span style={{ color: "var(--clg-text-body)", fontWeight: 600 }}>{trip.load_number || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--clg-text-muted)" }}>Destination</span>
            <span style={{ color: "var(--clg-text-body)", textAlign: "right", maxWidth: 200 }}>{trip.destination_name || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--clg-text-muted)" }}>Deadline</span>
            <span style={{ color: "var(--clg-text-body)" }}>{deadline ? fmtFull(deadline) : "Not on file"}</span>
          </div>
        </>
      )}
      {hos && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--clg-text-muted)" }}>HOS ({hos.duty_status || "unknown"})</span>
          <span style={{ color: "var(--clg-text-body)" }}>{fmtHM(hos.drive_remaining_minutes)} drive left</span>
        </div>
      )}
    </div>
  );
}

export function FaultCodeNotifyPanel({ unit, openDefects, recentFaults }) {
  const { vendors } = useVendors();
  const [vendorId, setVendorId] = useState("");
  const hasFindings = openDefects.length > 0 || recentFaults.length > 0;
  const vendor = vendors.find((v) => v.id === vendorId);

  if (!hasFindings) return null;

  const mailtoUrl = vendor?.contact_email
    ? buildMailto({
        to: vendor.contact_email,
        subject: `Fault codes / defects — Unit ${unit.number}`,
        body: [
          vendor.contact_name ? `Hi ${vendor.contact_name},` : "Hi,",
          "",
          `Sharing what's on file for Unit ${unit.number} ahead of drop-off:`,
          "",
          ...openDefects.map((d) => `DVIR: ${d.defect_type} (reported ${new Date(d.created_at).toLocaleDateString()})`),
          ...recentFaults.map((f) =>
            `Fault ${f.dtc_code}${f.dtc_description ? " — " + f.dtc_description : ""} (${f.light_severity ? f.light_severity.toUpperCase() : "info"}, ${f.samsara_reading_time ? new Date(f.samsara_reading_time).toLocaleString() : "—"})`
          ),
          "",
          "Thanks!",
        ].join("\n"),
      })
    : null;

  return (
    <div style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-md)", padding: 14 }}>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
        Send fault codes to a vendor
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Select
          value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="Choose a vendor"
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
        />
        {vendorId && !vendor?.contact_email && (
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>No contact email on file for this vendor yet.</div>
        )}
        <Button size="sm" iconLeft={<Mail size={13} />} href={mailtoUrl} disabled={!mailtoUrl}>
          Email fault codes
        </Button>
      </div>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
