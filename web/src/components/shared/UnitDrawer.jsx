import { useEffect, useState } from "react";
import { X, Loader2, MapPin } from "lucide-react";
import { Alert } from "../../ds";
import { useUnitDetail } from "../../hooks/useUnitDetail";
import UnitInfoCard from "../intake/UnitInfoCard";
import { cityStateFromAddress } from "../../lib/formatLocation";
import {
  Section, CurrentLoadSection, MaintenanceSchedule, WorkOrderHistory, FaultCodeNotifyPanel,
} from "./unitDetailShared";

// The quick-glance unit detail surface used from Board, Tracking, and Work
// Orders (ui-improvement-punch-list.md's "universal unit drawer") — click
// a unit number there and get this same side panel. The Units page itself
// uses the fuller UnitDetailPage instead (value/insurance, documents,
// check-in/check-out) — this stays a lighter slide-over for pages where a
// quick look is all that's needed. Section content is shared with
// UnitDetailPage via unitDetailShared.jsx rather than duplicated.
export default function UnitDrawer({ unitId, onClose }) {
  const { unit, orders, openDefects, recentFaults, trip, hos, maintenanceDue, loading, error, updateSchedule } = useUnitDetail(unitId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async (fields) => {
    setSaving(true);
    setSaveError(null);
    const err = await updateSchedule(fields);
    if (err) setSaveError(err.message);
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
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
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
                  <Section title="Live location">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <MapPin size={16} style={{ color: "var(--clg-text-muted)", flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--clg-text-heading)" }}>
                        {cityStateFromAddress(unit.current_location)}
                      </span>
                    </div>
                    {unit.samsara_synced_at && (
                      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
                        As of {new Date(unit.samsara_synced_at).toLocaleString()}
                      </div>
                    )}
                  </Section>
                )}

                <Section title="Maintenance schedule">
                  {saveError && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 12 }}>{saveError}</Alert>}
                  <MaintenanceSchedule unit={unit} maintenanceDue={maintenanceDue} onSave={handleSave} saving={saving} />
                </Section>

                <Section title={`Work order history (${orders.length})`}>
                  <WorkOrderHistory orders={orders} />
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
