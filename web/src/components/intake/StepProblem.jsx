import { CATEGORIES } from "../../lib/categories";
import UnitInfoCard from "./UnitInfoCard";

const SOURCES = [
  { value: "breakdown_call", label: "Driver breakdown call" },
  { value: "dvir", label: "DVIR defect" },
  { value: "pm_due", label: "PM due" },
  { value: "roadside", label: "Roadside" },
  { value: "inspection", label: "DOT inspection" },
  { value: "walk_around", label: "Shop walk-around" },
];

const SEVERITIES = [
  { value: "Unit down", title: "UNIT DOWN", sub: "Cannot move a load" },
  { value: "Urgent", title: "URGENT", sub: "Moves, fix in 48h" },
  { value: "Routine", title: "ROUTINE", sub: "Next shop visit" },
];

export default function StepProblem({ data, setData }) {
  const set = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", gap: 32, padding: "28px 32px", flex: 1, overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>How did this come in?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SOURCES.map((s) => {
              const selected = data.intakeSource === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, intakeSource: s.value }))}
                  style={{
                    padding: "8px 14px", fontSize: 12.5, cursor: "pointer",
                    border: "1px solid " + (selected ? "var(--clg-royal)" : "var(--clg-reflection)"),
                    background: selected ? "rgba(17,85,161,.07)" : "transparent",
                    color: selected ? "var(--clg-royal)" : "var(--clg-pewter)",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>Severity</div>
          <div style={{ display: "flex", gap: 10 }}>
            {SEVERITIES.map((s) => {
              const selected = data.severity === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, severity: s.value }))}
                  style={{
                    flex: 1, padding: "14px 16px", textAlign: "left", cursor: "pointer",
                    border: selected ? "2px solid var(--clg-scarlet)" : "1px solid var(--clg-reflection)",
                    background: selected ? "rgba(235,33,39,.05)" : "transparent",
                  }}
                >
                  <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13, color: selected ? "var(--clg-ruby)" : "var(--clg-navy)" }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--clg-pewter)", marginTop: 3 }}>{s.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>System &amp; component</div>
          <div style={{ display: "flex", gap: 12 }}>
            <select value={data.system} onChange={set("system")} style={{ flex: 1, padding: "11px 13px", border: "1px solid var(--clg-mercury)", fontSize: 13, color: "var(--clg-navy)" }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={data.component} onChange={set("component")} placeholder="e.g. Compressor / governor"
              style={{ flex: 1, padding: "11px 13px", border: "1px solid var(--clg-mercury)", fontSize: 13, color: "var(--clg-navy)" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--clg-navy)", fontWeight: 600, marginBottom: 8 }}>What the driver reported</div>
          <textarea
            value={data.complaint} onChange={set("complaint")}
            placeholder="What's wrong, where the unit is, anything relevant"
            style={{ flex: 1, minHeight: 96, border: "1px solid var(--clg-mercury)", padding: "12px 13px", fontSize: 13, color: "var(--clg-granite)", lineHeight: 1.6, fontFamily: "var(--clg-font-body)", resize: "vertical" }}
          />
        </div>
      </div>

      <div style={{ width: 320, flexShrink: 0 }}>
        <UnitInfoCard unit={data.unitInfo} />
      </div>
    </div>
  );
}
