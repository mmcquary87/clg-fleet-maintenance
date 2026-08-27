import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function UnitInfoCard({ unit }) {
  const [openDefects, setOpenDefects] = useState([]);
  const [recentFaults, setRecentFaults] = useState([]);

  useEffect(() => {
    if (!unit?.id) {
      setOpenDefects([]);
      setRecentFaults([]);
      return;
    }
    supabase.from("dvir_defects").select("id, defect_type, created_at")
      .eq("unit_id", unit.id).eq("is_resolved", false)
      .order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setOpenDefects(data ?? []));
    supabase.from("fault_events").select("id, dtc_code, dtc_description, samsara_reading_time")
      .eq("unit_id", unit.id)
      .order("samsara_reading_time", { ascending: false }).limit(3)
      .then(({ data }) => setRecentFaults(data ?? []));
  }, [unit?.id]);

  if (!unit) return null;

  const title = [unit.year, unit.make, unit.model].filter(Boolean).join(" ") || unit.type || "Truck";

  const rows = [
    ["DRIVER", unit.driver_name],
    ["LOCATION", unit.current_location],
    ["TRIP", unit.load_trip_id],
    ["ODOMETER", unit.odometer ? `${Number(unit.odometer).toLocaleString()} mi` : null],
    ["FUEL", unit.last_fuel_percent != null ? `${Math.round(unit.last_fuel_percent)}%${unit.fuel_type ? ` (${unit.fuel_type})` : ""}` : null],
    ["DOMICILE", unit.domicile],
    ["LAST PM", unit.last_pm_date ? new Date(unit.last_pm_date).toLocaleDateString() : null],
    ["WARRANTY", unit.warranty_status],
  ].filter(([, v]) => v);

  return (
    <div style={{ background: "var(--clg-navy)", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 10, letterSpacing: "0.14em", color: "var(--clg-mercury)" }}>
          UNIT {unit.number}
        </div>
      </div>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "#fff", marginTop: 6 }}>
        {title}
      </div>
      {unit.vin && <div style={{ fontSize: 12, color: "var(--clg-moon)", marginTop: 2 }}>VIN {unit.vin}</div>}

      {rows.length > 0 && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,.16)", margin: "16px 0" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", fontSize: 12 }}>
            {rows.map(([label, value]) => (
              <div key={label}>
                <div style={{ color: "var(--clg-cool)", fontSize: 10.5 }}>{label}</div>
                <div style={{ color: "#fff" }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {openDefects.length > 0 && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,.16)", margin: "16px 0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--clg-mercury)", fontSize: 10.5, letterSpacing: "0.1em", marginBottom: 8 }}>
            <AlertTriangle size={12} /> OPEN DVIR DEFECTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            {openDefects.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", color: "#fff" }}>
                <span>{d.defect_type}</span>
                <span style={{ color: "var(--clg-moon)", fontSize: 11 }}>{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {recentFaults.length > 0 && (
        <>
          <div style={{ height: 1, background: "rgba(255,255,255,.16)", margin: "16px 0" }} />
          <div style={{ color: "var(--clg-mercury)", fontSize: 10.5, letterSpacing: "0.1em", marginBottom: 8 }}>
            RECENT FAULT CODES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            {recentFaults.map((f) => (
              <div key={f.id} style={{ color: "#fff" }}>
                <span style={{ fontFamily: "var(--clg-font-mono)" }}>{f.dtc_code}</span>
                {f.dtc_description && <span style={{ color: "var(--clg-moon)" }}> — {f.dtc_description}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
