import { useState } from "react";

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d) {
  const day = d.getDay(); // 0 = Sunday
  const diff = new Date(d);
  diff.setDate(d.getDate() - day);
  return diff;
}

const PRESETS = [
  { id: "all", label: "All time", range: () => null },
  { id: "today", label: "Today", range: () => { const t = new Date(); return { start: toISO(t), end: toISO(t) }; } },
  { id: "week", label: "This week", range: () => { const t = new Date(); return { start: toISO(startOfWeek(t)), end: toISO(t) }; } },
  { id: "month", label: "This month", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISO(t) }; } },
  { id: "quarter", label: "This quarter", range: () => { const t = new Date(); const q = Math.floor(t.getMonth() / 3); return { start: toISO(new Date(t.getFullYear(), q * 3, 1)), end: toISO(t) }; } },
  { id: "ytd", label: "YTD", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), 0, 1)), end: toISO(t) }; } },
  { id: "custom", label: "Custom", range: null },
];

export default function DateRangeFilter({ onChange }) {
  const [active, setActive] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const selectPreset = (preset) => {
    setActive(preset.id);
    if (preset.id !== "custom") onChange(preset.range());
  };

  const applyCustom = () => {
    if (customStart || customEnd) onChange({ start: customStart || null, end: customEnd || null });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => selectPreset(p)}
          className={"toggle-btn" + (active === p.id ? " active" : "")}
          style={{ fontSize: 12, padding: "6px 12px" }}
        >
          {p.label}
        </button>
      ))}
      {active === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ fontSize: 12, padding: "6px 8px" }} />
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>to</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ fontSize: 12, padding: "6px 8px" }} />
          <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={applyCustom}>Apply</button>
        </div>
      )}
    </div>
  );
}
