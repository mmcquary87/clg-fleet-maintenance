import { useState } from "react";
import { X } from "lucide-react";

const VIEWS = [
  { key: "Driver side", src: "/tractor-diagram/driver-side.png" },
  { key: "Passenger side", src: "/tractor-diagram/passenger-side.png" },
  { key: "Front", src: "/tractor-diagram/front.png" },
  { key: "Rear", src: "/tractor-diagram/rear.png" },
];

// Click-to-mark damage diagram, same idea as a rental car check-in/out
// condition report: pick a view, click the spot, describe what's there.
// `markers` is a flat array across all four views (each carries its own
// `view`), so the parent just persists one array. A marker carried
// forward from the unit's last filed inspection is `preExisting: true`
// (rendered as a hollow ring) -- anything added in this session is
// `preExisting: false` ("found today", filled solid) and is what raises a
// new work order on filing, same as a failed checklist item. Removing a
// pre-existing marker here means it's been fixed and won't carry forward
// to the next inspection.
export default function TruckDamageDiagram({ markers, onChange }) {
  const [view, setView] = useState(VIEWS[0].key);
  const viewMarkers = markers.filter((m) => m.view === view);
  const activeView = VIEWS.find((v) => v.key === view);

  const addMarker = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const id = Math.random().toString(36).slice(2, 9);
    onChange([...markers, { id, view, x, y, part: "", note: "", preExisting: false }]);
  };

  const updateMarker = (id, patch) => onChange(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMarker = (id) => onChange(markers.filter((m) => m.id !== id));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {VIEWS.map((v) => {
          const count = markers.filter((m) => m.view === v.key).length;
          return (
            <button
              key={v.key} type="button" onClick={() => setView(v.key)}
              style={{
                fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: "var(--clg-radius-pill)", cursor: "pointer",
                border: "1px solid " + (view === v.key ? "var(--clg-navy)" : "var(--clg-border-default)"),
                background: view === v.key ? "var(--clg-navy)" : "transparent",
                color: view === v.key ? "#fff" : "var(--clg-text-muted)",
              }}
            >
              {v.key}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div
        onClick={addMarker}
        style={{
          position: "relative", border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)",
          background: "#fff", cursor: "crosshair", padding: "12px", maxWidth: 480,
        }}
      >
        <img src={activeView.src} alt={`Tractor, ${view.toLowerCase()}`} draggable={false} style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }} />
        {viewMarkers.map((m, i) => (
          <div
            key={m.id}
            title={[m.part, m.note].filter(Boolean).join(" — ") || "Click to describe"}
            style={{
              position: "absolute", left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)",
              width: 22, height: 22, borderRadius: "50%",
              background: m.preExisting ? "#fff" : "var(--clg-scarlet)",
              border: "2px solid var(--clg-scarlet)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: m.preExisting ? "var(--clg-scarlet)" : "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.25)",
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 6 }}>
        Click the diagram to mark a point of damage on this view. Hollow markers carried forward from the last inspection; solid markers are new today.
      </div>

      {viewMarkers.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
          {viewMarkers.map((m, i) => (
            <div key={m.id} style={{ border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: m.preExisting ? "#fff" : "var(--clg-scarlet)", border: "2px solid var(--clg-scarlet)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700,
                  color: m.preExisting ? "var(--clg-scarlet)" : "#fff",
                }}>
                  {i + 1}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                  color: m.preExisting ? "var(--clg-text-muted)" : "var(--clg-scarlet)",
                }}>
                  {m.preExisting ? "Pre-existing" : "Found today"}
                </span>
                <button
                  type="button" onClick={() => removeMarker(m.id)}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                >
                  <X size={13} /> Remove
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={m.part} onChange={(e) => updateMarker(m.id, { part: e.target.value })} placeholder="Part (e.g. Bumper)"
                  style={{ width: 140, fontSize: 12.5, padding: "7px 9px", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)" }}
                />
                <input
                  value={m.note} onChange={(e) => updateMarker(m.id, { note: e.target.value })} placeholder="Describe the damage"
                  style={{ flex: 1, fontSize: 12.5, padding: "7px 9px", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
