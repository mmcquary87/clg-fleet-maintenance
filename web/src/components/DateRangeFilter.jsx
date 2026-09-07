import { useState } from "react";
import { Input, Button } from "../ds";

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

const ALL_PRESETS = [
  { id: "today", label: "Today", range: () => { const t = new Date(); return { start: toISO(t), end: toISO(t) }; } },
  // Rolling trailing 7 days, not calendar-week-to-date — the latter
  // collapses to a single day whenever "today" falls on the week's first
  // day (confirmed: 2026-08-30 is a Sunday, so a Sunday-start week-to-date
  // range was just today alone, thin enough for a single bad vehicle
  // reading to blow up KPI 8's fleet MPG to 73.87). A full trailing week
  // also matches the KPI framework's own "per week" targets better than a
  // range that can be as short as one day.
  { id: "week", label: "This week", range: () => { const t = new Date(); const start = new Date(t); start.setDate(t.getDate() - 6); return { start: toISO(start), end: toISO(t) }; } },
  // The 7 days immediately before "This week"'s rolling window -- kept as
  // the same rolling-7-day shape rather than switching to a calendar week,
  // for the same reason "This week" isn't calendar-based (see above).
  { id: "lastWeek", label: "Last week", range: () => { const t = new Date(); const end = new Date(t); end.setDate(t.getDate() - 7); const start = new Date(t); start.setDate(t.getDate() - 13); return { start: toISO(start), end: toISO(end) }; } },
  { id: "month", label: "This month", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISO(t) }; } },
  // Full prior calendar month -- day 0 of the current month is the last
  // day of the previous one.
  { id: "lastMonth", label: "Last month", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)), end: toISO(new Date(t.getFullYear(), t.getMonth(), 0)) }; } },
  { id: "quarter", label: "This quarter", range: () => { const t = new Date(); const q = Math.floor(t.getMonth() / 3); return { start: toISO(new Date(t.getFullYear(), q * 3, 1)), end: toISO(t) }; } },
  { id: "ytd", label: "YTD", range: () => { const t = new Date(); return { start: toISO(new Date(t.getFullYear(), 0, 1)), end: toISO(t) }; } },
  { id: "all", label: "All time", range: () => null },
  { id: "custom", label: "Custom", range: null },
];

// disableAllTime: for date filters backed by a live external API that has
// no "give me everything" mode (e.g. Alvys trips/search always needs a
// bounded PickupDateRange/DeliveryDateRange) — "All time" there wouldn't
// just be slow, it silently returns nothing, which reads as broken.
//
// Rendered as one Smoke-track segmented control (CLG OS design package:
// "do not use free-floating pills for these — the choice is one-of-N, and
// pill radii are reserved for small status chips"), not individually
// bordered/pill-shaped buttons.
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
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{
        display: "inline-flex", flexWrap: "wrap", background: "var(--clg-smoke)",
        borderRadius: "var(--clg-radius-md)", padding: 3, gap: 2,
      }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPreset(p)}
            style={{
              padding: "7px 12px", borderRadius: 3, border: "none", cursor: "pointer",
              fontFamily: "var(--clg-font-heading)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              background: active === p.id ? "var(--clg-navy)" : "transparent",
              color: active === p.id ? "#fff" : "var(--clg-pewter)",
              transition: "background-color var(--clg-dur-base) var(--clg-ease-out), color var(--clg-dur-base) var(--clg-ease-out)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {active === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ fontSize: 12, padding: "7px 10px" }} />
          <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>to</span>
          <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ fontSize: 12, padding: "7px 10px" }} />
          <Button size="sm" onClick={applyCustom}>Apply</Button>
        </div>
      )}
    </div>
  );
}
