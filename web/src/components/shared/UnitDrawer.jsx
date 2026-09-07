import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useUnitDetail } from "../../hooks/useUnitDetail";
import UnitInfoCard from "../intake/UnitInfoCard";
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
