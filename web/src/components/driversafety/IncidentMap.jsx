import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Loader2 } from "lucide-react";
import { Eyebrow } from "../../ds";
import { useIncidentMapEvents } from "../../hooks/useIncidentMapEvents";

// Matches StatusPill's TONES hues (not a new categorical palette), as
// literal hex rather than var(--clg-*) -- Leaflet's canvas renderer paints
// these directly, which doesn't reliably resolve CSS custom properties the
// way an inline style would.
const TIER_COLOR = { high: "#BE202E", moderate: "#9A6B1E", minor: "#7A8B99" };
const TIER_LABEL = { high: "High severity", moderate: "Moderate", minor: "Minor" };
const TIER_WEIGHT = { high: 1, moderate: 0.6, minor: 0.3 };
const HEAT_GRADIENT = { 0.2: TIER_COLOR.minor, 0.5: TIER_COLOR.moderate, 1.0: TIER_COLOR.high };

const TYPE_FILTERS = [
  { id: "all", label: "All events" },
  { id: "speeding", label: "Speeding" },
  { id: "safety", label: "Safety" },
  { id: "high", label: "High severity only" },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none", cursor: "pointer", borderRadius: "var(--clg-radius-pill)",
        padding: "6px 14px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        background: active ? "var(--clg-navy)" : "var(--clg-surface-subtle)",
        color: active ? "#fff" : "var(--clg-text-body)",
      }}
    >
      {children}
    </button>
  );
}

export default function IncidentMap() {
  const { events, loading, error } = useIncidentMapEvents();
  const [filter, setFilter] = useState("all");
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);

  const filtered = events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "high") return e.tier === "high";
    return e.type === filter;
  });

  // Create the Leaflet map once per mount, tear it down on unmount --
  // this tab's content unmounts when you switch away (same as every
  // other tab here), and recreating or leaking the map instance across
  // that is exactly what renders blank on remount, per the design
  // handoff's own warning about this gotcha.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([32, -85], 6);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 16,
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      heatLayerRef.current = null;
    };
  }, []);

  // Redraw the heat layer whenever the filtered set changes. leaflet.heat
  // is an old UMD-style plugin that assigns onto a global `L` rather than
  // importing it -- loaded here as a dynamic import, after pointing
  // window.L at the same Leaflet instance this file imports, so
  // L.heatLayer exists by the time it's called. Done inside the effect
  // (not at module scope) so it stays scoped to this component's own
  // lifecycle, same spirit as the map-instance cleanup above.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      if (!L.heatLayer) {
        if (typeof window !== "undefined") window.L = L;
        await import("leaflet.heat");
      }
      if (cancelled) return;

      const points = filtered.map((e) => [e.lat, e.lng, TIER_WEIGHT[e.tier] ?? 0.3]);
      if (heatLayerRef.current) {
        heatLayerRef.current.setLatLngs(points);
      } else {
        heatLayerRef.current = L.heatLayer(points, {
          radius: 30, blur: 22, maxZoom: 12, max: 1, gradient: HEAT_GRADIENT,
        }).addTo(map);
      }

      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points.map((p) => [p[0], p[1]])), { padding: [24, 24], maxZoom: 12 });
      }
    })();
    return () => { cancelled = true; };
  }, [filtered]);

  const tierCounts = { high: 0, moderate: 0, minor: 0 };
  filtered.forEach((e) => { tierCounts[e.tier] += 1; });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Eyebrow>{events.length} event{events.length === 1 ? "" : "s"} located · trailing 90 days</Eyebrow>
        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16 }}>
        <div ref={containerRef} style={{ height: 460, borderRadius: "var(--clg-radius-md)", overflow: "hidden" }} />
        <div>
          <Eyebrow style={{ marginBottom: 10 }}>Legend</Eyebrow>
          {["high", "moderate", "minor"].map((tier) => (
            <div key={tier} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: TIER_COLOR[tier], flexShrink: 0 }} />
              <span>{TIER_LABEL[tier]} <span style={{ color: "var(--clg-text-muted)" }}>· {tierCounts[tier]}</span></span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 12, lineHeight: 1.5 }}>
            Glow intensity is weighted by severity, not just count — one high-severity event reads as hot as several
            minor ones close together. HOS violations have no location data in Samsara and aren't shown here.
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0", color: "var(--clg-cool)", fontSize: 13 }}>
          <Loader2 size={14} className="spin" /> Loading events…
        </div>
      )}
      {!loading && events.length === 0 && !error && (
        <div style={{ padding: "16px 0", color: "var(--clg-text-muted)", fontSize: 13 }}>
          No located events in the last 90 days.
        </div>
      )}
    </div>
  );
}
