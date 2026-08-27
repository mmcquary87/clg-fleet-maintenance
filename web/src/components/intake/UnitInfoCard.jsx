import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const SEVERITY_COLOR = { red: "#EB2127", amber: "#E8A33D", yellow: "#F2CB4E", green: "#4ADE80" };
const SEVERITY_RANK = { red: 3, amber: 2, yellow: 1 };
const DPF_KEYWORDS = ["dpf", "particulate", "soot", "regen"];

function isDpfRelated(text) {
  const t = (text || "").toLowerCase();
  return DPF_KEYWORDS.some((k) => t.includes(k));
}

function CheckEngineLight({ severity }) {
  const color = SEVERITY_COLOR[severity] || SEVERITY_COLOR.green;
  const label = severity ? `${severity.toUpperCase()} — active fault` : "No active faults (last 7 days)";
  return (
    <div title={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, display: "inline-block" }} />
      <span style={{ fontSize: 10.5, color: "var(--clg-moon)" }}>{severity ? severity.toUpperCase() : "OK"}</span>
    </div>
  );
}

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
    supabase.from("fault_events").select("id, dtc_code, dtc_description, samsara_reading_time, light_severity")
      .eq("unit_id", unit.id)
      .order("samsara_reading_time", { ascending: false }).limit(5)
      .then(({ data }) => setRecentFaults(data ?? []));
  }, [unit?.id]);

  if (!unit) return null;

  const title = [unit.year, unit.make, unit.model].filter(Boolean).join(" ") || unit.type || "Truck";
  const worstSeverity = recentFaults.reduce((worst, f) => {
    if (!f.light_severity) return worst;
    return !worst || SEVERITY_RANK[f.light_severity] > SEVERITY_RANK[worst] ? f.light_severity : worst;
  }, null);

  const rows = [
    ["DRIVER", unit.driver_name],
    ["LOCATION", unit.current_location],
    ["TRIP", unit.load_trip_id],
    ["ODOMETER", unit.odometer ? `${Number(unit.odometer).toLocaleString()} mi` : null],
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

      {/* Fuel + check-engine-light status — the truck's at-a-glance health */}
      {(unit.last_fuel_percent != null || unit.samsara_synced_at) && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 14, padding: "10px 12px", background: "rgba(255,255,255,.06)",
        }}>
          <div>
            <div style={{ color: "var(--clg-cool)", fontSize: 10.5 }}>FUEL</div>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
              {unit.last_fuel_percent != null ? `${Math.round(unit.last_fuel_percent)}%` : "—"}
              {unit.fuel_type && <span style={{ color: "var(--clg-moon)", fontWeight: 400, fontSize: 11 }}> ({unit.fuel_type})</span>}
            </div>
          </div>
          <CheckEngineLight severity={worstSeverity} />
        </div>
      )}

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
          <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
            {recentFaults.map((f) => (
              <div key={f.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {f.light_severity && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEVERITY_COLOR[f.light_severity], flexShrink: 0 }} />
                  )}
                  <span style={{ fontFamily: "var(--clg-font-mono)", color: "#fff" }}>{f.dtc_code}</span>
                  {isDpfRelated(f.dtc_description) && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--clg-scarlet)", letterSpacing: "0.05em" }}>DPF</span>
                  )}
                </div>
                {f.dtc_description && <div style={{ color: "var(--clg-moon)", fontSize: 11.5, marginLeft: 13 }}>{f.dtc_description}</div>}
                <div style={{ color: "var(--clg-cool)", fontSize: 10.5, marginLeft: 13 }}>
                  {f.samsara_reading_time ? new Date(f.samsara_reading_time).toLocaleString() : "—"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {unit.samsara_synced_at && (
        <div style={{ marginTop: 14, fontSize: 10.5, color: "var(--clg-cool)" }}>
          Samsara last synced {new Date(unit.samsara_synced_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
