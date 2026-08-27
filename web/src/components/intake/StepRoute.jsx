import UnitInfoCard from "./UnitInfoCard";

export default function StepRoute({ data, setData, approvalThreshold }) {
  const set = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }));
  const overThreshold = Number(data.estimate) > approvalThreshold;

  return (
    <div style={{ display: "flex", gap: 32, padding: "28px 32px", flex: 1 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ border: "1px solid var(--clg-reflection)", padding: "15px 16px", background: "var(--clg-surface-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", color: "var(--clg-navy)" }}>
              WHO FIXES IT
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {["inhouse", "vendor"].map((who) => (
                <button
                  key={who}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, whoFixes: who }))}
                  style={{
                    padding: "5px 11px", fontSize: 11.5, cursor: "pointer",
                    border: "1px solid " + (data.whoFixes === who ? "var(--clg-royal)" : "var(--clg-reflection)"),
                    background: data.whoFixes === who ? "var(--clg-royal)" : "#fff",
                    color: data.whoFixes === who ? "#fff" : "var(--clg-pewter)",
                  }}
                >
                  {who === "inhouse" ? "In-house" : "Vendor"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {data.whoFixes === "vendor" ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, color: "var(--clg-cool)", letterSpacing: "0.08em", marginBottom: 5 }}>VENDOR</div>
                <input
                  value={data.vendorName} onChange={set("vendorName")} placeholder="e.g. Rush Truck Center — Pensacola"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--clg-mercury)", background: "#fff", color: "var(--clg-navy)", fontSize: 12.5, boxSizing: "border-box" }}
                />
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 11, color: "var(--clg-cool)", letterSpacing: "0.08em", marginBottom: 5 }}>BAY</div>
                  <input value={data.assignedBay} onChange={set("assignedBay")} placeholder="e.g. Bay 1"
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--clg-mercury)", background: "#fff", color: "var(--clg-navy)", fontSize: 12.5, boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--clg-cool)", letterSpacing: "0.08em", marginBottom: 5 }}>TECH</div>
                  <input value={data.assignedTech} onChange={set("assignedTech")} placeholder="e.g. R. Salas"
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--clg-mercury)", background: "#fff", color: "var(--clg-navy)", fontSize: 12.5, boxSizing: "border-box" }} />
                </div>
              </>
            )}

            <div>
              <div style={{ fontSize: 11, color: "var(--clg-cool)", letterSpacing: "0.08em", marginBottom: 5 }}>ESTIMATE</div>
              <input
                type="number" min="0" step="0.01" value={data.estimate} onChange={set("estimate")} placeholder="0.00"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--clg-mercury)", background: "#fff", color: "var(--clg-navy)", fontSize: 12.5, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--clg-cool)", letterSpacing: "0.08em", marginBottom: 5 }}>PROMISED BACK</div>
              <input
                type="date" value={data.promisedBack} onChange={set("promisedBack")}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--clg-mercury)", background: "#fff", color: "var(--clg-navy)", fontSize: 12.5, boxSizing: "border-box" }}
              />
            </div>
          </div>

          {overThreshold && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(235,33,39,.07)", borderLeft: "4px solid var(--clg-scarlet)", fontSize: 12, color: "var(--clg-granite)" }}>
              Over the ${approvalThreshold.toLocaleString()} threshold — this will need manager approval before work starts.
            </div>
          )}
        </div>
      </div>

      <div style={{ width: 320, flexShrink: 0 }}>
        <UnitInfoCard unit={data.unitInfo} />
      </div>
    </div>
  );
}
