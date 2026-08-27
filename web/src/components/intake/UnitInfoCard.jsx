export default function UnitInfoCard({ unit }) {
  if (!unit) return null;
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
        {unit.type || "Truck"}
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
    </div>
  );
}
