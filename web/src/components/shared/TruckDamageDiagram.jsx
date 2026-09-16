import { useState } from "react";
import { X } from "lucide-react";

const VIEWS = ["Front", "Driver side", "Passenger side", "Rear"];

// Simple line-art schematics -- same idea as a rental car's condition
// diagram, not a photorealistic drawing. Side view is one shape, mirrored
// with CSS for the passenger side rather than drawn twice.
function FrontView() {
  return (
    <svg viewBox="0 0 200 170" style={{ width: "100%", height: "auto", display: "block" }}>
      <path d="M45,45 L62,15 L138,15 L155,45 Z" fill="#EAF0F6" stroke="#12213D" strokeWidth="2" />
      <rect x="30" y="45" width="140" height="85" rx="8" fill="#EAF0F6" stroke="#12213D" strokeWidth="2" />
      <circle cx="55" cy="65" r="9" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="145" cy="65" r="9" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <rect x="70" y="95" width="60" height="14" rx="3" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="52" cy="140" r="18" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="148" cy="140" r="18" fill="#fff" stroke="#12213D" strokeWidth="2" />
    </svg>
  );
}

function SideView() {
  return (
    <svg viewBox="0 0 400 170" style={{ width: "100%", height: "auto", display: "block" }}>
      <path d="M20,130 L20,75 Q20,52 42,52 L95,52 Q106,52 113,38 L150,38 L150,130 Z" fill="#EAF0F6" stroke="#12213D" strokeWidth="2" />
      <rect x="60" y="65" width="30" height="22" rx="2" fill="#fff" stroke="#12213D" strokeWidth="1.5" />
      <rect x="150" y="100" width="190" height="28" fill="#EAF0F6" stroke="#12213D" strokeWidth="2" />
      <circle cx="195" cy="128" r="15" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="55" cy="140" r="20" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="285" cy="140" r="20" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="325" cy="140" r="20" fill="#fff" stroke="#12213D" strokeWidth="2" />
    </svg>
  );
}

function RearView() {
  return (
    <svg viewBox="0 0 200 170" style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="30" y="35" width="140" height="80" rx="8" fill="#EAF0F6" stroke="#12213D" strokeWidth="2" />
      <rect x="45" y="48" width="110" height="45" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <rect x="18" y="90" width="9" height="55" fill="#12213D" />
      <circle cx="52" cy="140" r="18" fill="#fff" stroke="#12213D" strokeWidth="2" />
      <circle cx="148" cy="140" r="18" fill="#fff" stroke="#12213D" strokeWidth="2" />
    </svg>
  );
}

function SchematicFor(view) {
  if (view === "Front") return <FrontView />;
  if (view === "Rear") return <RearView />;
  return <div style={{ transform: view === "Passenger side" ? "scaleX(-1)" : undefined }}><SideView /></div>;
}

// Click-to-mark damage diagram, same idea as a rental car check-in/out
// condition report: pick a view, click the spot, describe what's there.
// `markers` is a flat array across all four views (each carries its own
// `view`), so the parent just persists one array.
export default function TruckDamageDiagram({ markers, onChange }) {
  const [view, setView] = useState(VIEWS[0]);
  const viewMarkers = markers.filter((m) => m.view === view);

  const addMarker = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const id = Math.random().toString(36).slice(2, 9);
    onChange([...markers, { id, view, x, y, note: "" }]);
  };

  const updateNote = (id, note) => onChange(markers.map((m) => (m.id === id ? { ...m, note } : m)));
  const removeMarker = (id) => onChange(markers.filter((m) => m.id !== id));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {VIEWS.map((v) => {
          const count = markers.filter((m) => m.view === v).length;
          return (
            <button
              key={v} type="button" onClick={() => setView(v)}
              style={{
                fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: "var(--clg-radius-pill)", cursor: "pointer",
                border: "1px solid " + (view === v ? "var(--clg-navy)" : "var(--clg-border-default)"),
                background: view === v ? "var(--clg-navy)" : "transparent",
                color: view === v ? "#fff" : "var(--clg-text-muted)",
              }}
            >
              {v}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div
        onClick={addMarker}
        style={{
          position: "relative", border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)",
          background: "#fff", cursor: "crosshair", padding: "20px 16px", maxWidth: 420,
        }}
      >
        {SchematicFor(view)}
        {viewMarkers.map((m, i) => (
          <div
            key={m.id}
            title={m.note || "Click to add a note"}
            style={{
              position: "absolute", left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)",
              width: 20, height: 20, borderRadius: "50%", background: "var(--clg-scarlet)", border: "2px solid #fff",
              boxShadow: "0 0 0 1px var(--clg-scarlet)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10.5, fontWeight: 700, color: "#fff",
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 6 }}>Click the diagram to mark damage on this view.</div>

      {viewMarkers.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
          {viewMarkers.map((m, i) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%", background: "var(--clg-scarlet)", flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, color: "#fff", fontWeight: 700,
              }}>
                {i + 1}
              </span>
              <input
                value={m.note} onChange={(e) => updateNote(m.id, e.target.value)} placeholder="Describe the damage"
                style={{ flex: 1, fontSize: 12.5, padding: "7px 9px", border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)" }}
              />
              <button type="button" onClick={() => removeMarker(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", padding: 4 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
