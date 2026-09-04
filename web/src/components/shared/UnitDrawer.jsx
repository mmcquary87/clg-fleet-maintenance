import { useEffect, useState } from "react";
import { X, Loader2, Save, Mail } from "lucide-react";
import { Badge, Input, Select, Button } from "../../ds";
import { useUnitDetail } from "../../hooks/useUnitDetail";
import { useVendors } from "../../hooks/useVendors";
import { MILESTONES, nextDueDate, dueStatus } from "../../lib/maintenanceSchedule";
import { buildMailto } from "../../lib/mailto";
import UnitInfoCard from "../intake/UnitInfoCard";

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtHM(minutes) {
  if (typeof minutes !== "number") return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function fmtFull(value) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusTone(status) {
  if (status === "overdue") return "critical";
  if (status === "due_soon") return "accent";
  if (status === "ok") return "brand";
  return "neutral";
}

function statusLabel(status) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "ok") return "On track";
  return "Not set";
}

// The Annual Inspection milestone above is entirely manual -- last_annual_
// inspection_date only updates when someone closes an "Annual" work order
// in this app, so it can silently disagree with the real certificate on
// file. This surfaces that real answer (synced from Alvys documents)
// alongside it rather than replacing the milestone tracker, since that's
// the only kind currently populated by a sync (see useUnitDetail.js).
function alvysDotInspectionNote(maintenanceDue) {
  const row = (maintenanceDue ?? []).find((d) => d.kind === "dot_inspection");
  if (!row) return null;
  if (row.basis === "alvys_certificate" && row.due_date) {
    return { tone: "brand", text: `Alvys certificate on file — expires ${row.due_date}` };
  }
  if (row.basis === "no_document_on_file") {
    return { tone: "critical", text: "No DOT inspection document found on file in Alvys" };
  }
  return null;
}

function MilestoneRow({ milestone, unit, onSave, saving }) {
  const interval = milestone.fixedInterval ?? unit[milestone.intervalField];
  const [lastDate, setLastDate] = useState(unit[milestone.lastField] || "");
  const [intervalDays, setIntervalDays] = useState(milestone.intervalField ? (unit[milestone.intervalField] ?? "") : "");

  useEffect(() => {
    setLastDate(unit[milestone.lastField] || "");
    setIntervalDays(milestone.intervalField ? (unit[milestone.intervalField] ?? "") : "");
  }, [unit, milestone]);

  const next = nextDueDate(unit[milestone.lastField], interval);
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

function CurrentLoadSection({ trip, hos }) {
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

function FaultCodeNotifyPanel({ unit, openDefects, recentFaults }) {
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

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// The single unit detail surface for the whole app (ui-improvement-punch-
// list.md's "universal unit drawer") — click a unit number on Board,
// Tracking, Work Orders, or Units and get this same side panel instead of a
// per-page reimplementation. Still missing a couple of fields the punch
// list lists (full YTD spend split, tire/inspection history) — this is a
// first version built against data already wired up elsewhere; work order
// history below already carries individual job cost, so per-unit spend
// isn't lost, just not yet rolled up into one total here.
export default function UnitDrawer({ unitId, onClose }) {
  const { unit, orders, openDefects, recentFaults, trip, hos, maintenanceDue, loading, error, updateSchedule } = useUnitDetail(unitId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async (fields) => {
    setSaving(true);
    await updateSchedule(fields);
    setSaving(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, .45)", zIndex: 100,
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--clg-surface-card)", width: "100%", maxWidth: 480, height: "100%",
          boxShadow: "var(--clg-shadow-lg, -12px 0 40px rgba(0,0,0,.2))",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--clg-text-muted)" }}>
            <Loader2 size={18} className="spin" />
          </div>
        ) : error || !unit ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "var(--clg-scarlet)", fontSize: 13 }}>{error || "Unit not found."}</div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={onClose}
              style={{
                position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.14)", border: "none",
                borderRadius: "var(--clg-radius-sm)", cursor: "pointer", color: "#fff", padding: 6, display: "flex", zIndex: 1,
              }}
            >
              <X size={18} />
            </button>

            <div style={{ overflowY: "auto", flex: 1 }}>
              <UnitInfoCard unit={unit} />

              <div style={{ padding: "20px 24px" }}>
                <Section title="Current load & HOS">
                  <CurrentLoadSection trip={trip} hos={hos} />
                </Section>

                {unit.current_location && (
                  <Section title="Map">
                    <div style={{ borderRadius: "var(--clg-radius-md)", overflow: "hidden", border: "1px solid var(--clg-border-subtle)" }}>
                      <iframe
                        title={`Map — ${unit.current_location}`}
                        width="100%" height="180" style={{ border: 0, display: "block" }}
                        loading="lazy"
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(unit.current_location)}&output=embed`}
                      />
                    </div>
                  </Section>
                )}

                <Section title="Maintenance schedule">
                  {MILESTONES.map((m) => {
                    const dotNote = m.key === "annual" ? alvysDotInspectionNote(maintenanceDue) : null;
                    return (
                      <div key={m.key}>
                        <MilestoneRow milestone={m} unit={unit} onSave={handleSave} saving={saving} />
                        {dotNote && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 0 0", fontSize: 12 }}>
                            <Badge tone={dotNote.tone}>Alvys</Badge>
                            <span style={{ color: "var(--clg-text-muted)" }}>{dotNote.text}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Section>

                <Section title={`Work order history (${orders.length})`}>
                  {orders.length === 0 ? (
                    <div style={{ padding: "16px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
                      No work orders logged for this unit yet.
                    </div>
                  ) : (
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
                  )}
                </Section>

                <FaultCodeNotifyPanel unit={unit} openDefects={openDefects} recentFaults={recentFaults} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
