import { useState } from "react";

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

const ALL_PRESETS = [
  { id: "all", label: "All time", range: () => null },
  { id: "today", label: "Today", range: () => { const t = new Date(); return { start: toISO(t), end: toISO(t) }; } },
  // Rolling trailing 7 days, not calendar-week-to-date — the latter
  // collapses to a single day whenever "today" falls on the week's first
  // day (confirmed: 2026-08-30 is a Sunday, so a Sunday-start week-to-date
  // range was just today alone, thin enough for a single bad vehicle
  // reading to blow up KPI 8's fleet MPG to 73.87). A full trailing week
  // also matches the KPI framework's own "per week" targets better than a
  // range that can be as short as one day.
  { id: "week", label: "This week", range: () => { const t = new Date(); const start = new Date(t); start.setDate(t.getDate() - 6); return { start: toISO(start), end: toISO(t) }; } },
  { id: "month", label: "This month", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISO(t) }; } },
  { id: "quarter", label: "This quarter", range: () => { const t = new Date(); const q = Math.floor(t.getMonth() / 3); return { start: toISO(new Date(t.getFullYear(), q * 3, 1)), end: toISO(t) }; } },
  { id: "ytd", label: "YTD", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), 0, 1)), end: toISO(t) }; } },
  { id: "custom", label: "Custom", range: null },
];

// disableAllTime: for date filters backed by a live external API that has
// no "give me everything" mode (e.g. Alvys trips/search always needs a
// bounded PickupDateRange/DeliveryDateRange) — "All time" there wouldn't
// just be slow, it silently returns nothing, which reads as broken.
export default function DateRangeFilter({ onChange, disableAllTime = false }) {
  const PRESETS = disableAllTime ? ALL_PRESETS.filter((p) => p.id !== "all") : ALL_PRESETS;
  const [active, setActive] = useState(disableAllTime ? "month" : "all");
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
