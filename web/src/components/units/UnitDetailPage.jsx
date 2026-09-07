import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "../../ds";
import { useUnitDetail } from "../../hooks/useUnitDetail";
import UnitInfoCard from "../intake/UnitInfoCard";
import {
  Section, CurrentLoadSection, MaintenanceSchedule, WorkOrderHistory, FaultCodeNotifyPanel, money,
} from "../shared/unitDetailShared";
import AssetLifecycleCard from "./AssetLifecycleCard";
import UnitDocumentsPanel from "./UnitDocumentsPanel";
import UnitCheckinsPanel from "./UnitCheckinsPanel";

const OWNERSHIP_LABEL = { owned: "CLG-owned", penske_lease: "Penske lease", hale_lease: "Hale lease" };
const OWNERSHIP_TONE = { owned: "neutral", penske_lease: "brand", hale_lease: "brand" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "service", label: "Service" },
  { id: "value", label: "Value & Insurance" },
  { id: "documents", label: "Documents" },
  { id: "compliance", label: "Compliance" },
];

function fmtDate(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString() : "Not on file";
}

// The full per-unit view for the Units page (as opposed to the lighter
// UnitDrawer slide-over used from Board/Tracking/Work Orders) -- room for
// everything a unit accumulates over its life: info, service history,
// value/insurance/lease standing, documents/photos, and a compliance log
// including driver check-in/check-out. Shares its section content with
// UnitDrawer via unitDetailShared.jsx rather than duplicating it.
export default function UnitDetailPage({ unitId, onBack, canViewAssetLifecycle }) {
  const { unit, orders, openDefects, recentFaults, trip, hos, maintenanceDue, loading, error, updateSchedule } = useUnitDetail(unitId);
  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);

  const handleSave = async (fields) => {
    setSaving(true);
    await updateSchedule(fields);
    setSaving(false);
  };

  if (loading) {
    return <div style={{ padding: 40, display: "flex", justifyContent: "center", color: "var(--clg-text-muted)" }}><Loader2 size={18} className="spin" /></div>;
  }
  if (error || !unit) {
    return (
      <div style={{ padding: 24 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", marginBottom: 12 }}>
          <ArrowLeft size={14} /> Back to Units
        </button>
        <div style={{ color: "var(--clg-scarlet)", fontSize: 13 }}>{error || "Unit not found."}</div>
      </div>
    );
  }

  const ytdSpend = orders
    .filter((o) => o.date_closed && new Date(o.date_closed).getFullYear() === new Date().getFullYear())
    .reduce((s, o) => s + Number(o.cost || 0), 0);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--clg-royal)", marginBottom: 16, fontSize: 13 }}>
        <ArrowLeft size={14} /> Back to Units
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, color: "var(--clg-navy)", margin: 0 }}>Unit {unit.number}</h2>
        <Badge tone={OWNERSHIP_TONE[unit.ownership] || "neutral"}>{OWNERSHIP_LABEL[unit.ownership] || "CLG-owned"}</Badge>
        {!unit.is_active && <Badge tone="critical">Inactive</Badge>}
        {unit.plate_number && <Badge tone="neutral">Plate {unit.plate_number}</Badge>}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 18 }}>
        {[unit.type, unit.year && unit.make && unit.model ? `${unit.year} ${unit.make} ${unit.model}` : null, unit.vin]
          .filter(Boolean).join(" · ")}
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--clg-border-subtle)", marginBottom: 20, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
              color: tab === t.id ? "var(--clg-royal)" : "var(--clg-text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--clg-royal)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <UnitInfoCard unit={unit} />
          </div>
          <Section title="Current load & HOS">
            <CurrentLoadSection trip={trip} hos={hos} />
          </Section>
          {unit.current_location && (
            <Section title="Map">
              <div style={{ borderRadius: "var(--clg-radius-md)", overflow: "hidden", border: "1px solid var(--clg-border-subtle)" }}>
                <iframe
                  title={`Map — ${unit.current_location}`}
                  width="100%" height="220" style={{ border: 0, display: "block" }}
                  loading="lazy"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(unit.current_location)}&output=embed`}
                />
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === "service" && (
        <div>
          <Section title="Maintenance schedule">
            <MaintenanceSchedule unit={unit} maintenanceDue={maintenanceDue} onSave={handleSave} saving={saving} />
          </Section>
          <Section title={`Work order history (${orders.length}) · YTD spend ${money(ytdSpend)}`}>
            <WorkOrderHistory orders={orders} />
          </Section>
        </div>
      )}

      {tab === "value" && (
        <div>
          <Section title="Ownership & lease">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--clg-text-muted)" }}>Ownership</span>
                <span style={{ color: "var(--clg-text-body)", fontWeight: 600 }}>{OWNERSHIP_LABEL[unit.ownership] || "CLG-owned"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--clg-text-muted)" }}>Current value</span>
                <span style={{ color: "var(--clg-text-body)", fontWeight: 600 }}>
                  {unit.current_market_value != null ? money(unit.current_market_value) : "Not on file"}
                  {unit.current_market_value_date ? ` (as of ${fmtDate(unit.current_market_value_date)})` : ""}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--clg-text-muted)" }}>In service since</span>
                <span style={{ color: "var(--clg-text-body)" }}>{fmtDate(unit.in_service_date)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--clg-text-muted)" }}>Plate expires</span>
                <span style={{ color: "var(--clg-text-body)" }}>{fmtDate(unit.plate_expires_at)}</span>
              </div>
              {unit.lease_reference && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--clg-text-muted)" }}>Lessor reference</span>
                  <span style={{ color: "var(--clg-text-body)", textAlign: "right", maxWidth: 260 }}>{unit.lease_reference}</span>
                </div>
              )}
              {unit.lease_status_note && (
                <div style={{ marginTop: 4, padding: "8px 10px", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", fontSize: 11.5, color: "var(--clg-scarlet)" }}>
                  {unit.lease_status_note}
                </div>
              )}
            </div>
          </Section>
          {canViewAssetLifecycle && unit.ownership === "owned" && (
            <Section title="Asset lifecycle">
              <AssetLifecycleCard unitNumber={unit.number} />
            </Section>
          )}
        </div>
      )}

      {tab === "documents" && <UnitDocumentsPanel unitId={unitId} />}

      {tab === "compliance" && (
        <div>
          <Section title="Open DVIR defects & recent fault codes">
            {openDefects.length === 0 && recentFaults.length === 0 ? (
              <div style={{ padding: "12px 0", color: "var(--clg-text-muted)", fontSize: 13 }}>Nothing outstanding.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                {openDefects.map((d) => (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{d.defect_type}</span>
                    <span style={{ color: "var(--clg-text-muted)" }}>{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {recentFaults.map((f) => (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{f.dtc_code}{f.dtc_description ? ` — ${f.dtc_description}` : ""}</span>
                    <span style={{ color: "var(--clg-text-muted)" }}>{f.samsara_reading_time ? new Date(f.samsara_reading_time).toLocaleDateString() : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Driver check-in / check-out log">
            <UnitCheckinsPanel unitId={unitId} />
          </Section>
          <FaultCodeNotifyPanel unit={unit} openDefects={openDefects} recentFaults={recentFaults} />
        </div>
      )}
    </div>
  );
}
