import { LayoutGrid, MapPin, RefreshCw, BarChart3, ClipboardList, CircleDollarSign, Truck, Briefcase, User, Wrench, Settings, LogOut } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Persistent left sidebar, per design_handoff/CLG-OS-Design-Package's shell
// spec (2026-09-04) -- replaces the old horizontal top-nav bar. 230px,
// navy, sticky full-height; five grouped sections; account chip pinned to
// the bottom.
const NAV_GROUPS = [
  {
    id: "overview", label: "Overview",
    items: [
      { id: "board", label: "Board", Icon: LayoutGrid },
      { id: "tracking", label: "Tracking", Icon: MapPin },
      { id: "reloads", label: "Reloads", Icon: RefreshCw },
      { id: "operations", label: "Operations", Icon: BarChart3 },
    ],
  },
  { id: "work", label: "Work", items: [{ id: "workorders", label: "Work orders", Icon: ClipboardList }] },
  {
    id: "fleet", label: "Fleet",
    items: [
      { id: "spend", label: "Spend", Icon: CircleDollarSign },
      { id: "units", label: "Units", Icon: Truck },
      { id: "vendors", label: "Vendors", Icon: Briefcase },
    ],
  },
  // "Home time" is intentionally not in nav (2026-09-04, CLG) -- a Power BI
  // driver dashboard is planned to eventually cover this ground; the page
  // and its data stay in the codebase (Dashboard.jsx still renders
  // tab === "hometime") in case it's needed again before that ships.
  { id: "drivers", label: "Drivers", items: [{ id: "roster", label: "Drivers", Icon: User }] },
];

function initialsFor(email) {
  return (email || "").split("@")[0].slice(0, 2).toUpperCase();
}

function iconButtonStyle() {
  return {
    background: "none", border: "none", cursor: "pointer", color: "var(--clg-mercury)",
    display: "flex", padding: 4, flexShrink: 0,
  };
}

export default function Sidebar({ tab, onNavigate, canUseMechanicQueue, isAdmin, email }) {
  const groups = canUseMechanicQueue
    ? [...NAV_GROUPS, { id: "mechanic", label: "Mechanic + admin only", items: [{ id: "mechanic", label: "Mechanic", Icon: Wrench }] }]
    : NAV_GROUPS;

  return (
    <div style={{
      width: 230, flexShrink: 0, background: "var(--clg-navy)", minHeight: "100vh",
      position: "sticky", top: 0, alignSelf: "flex-start", display: "flex", flexDirection: "column", padding: "20px 0",
    }}>
      <button
        onClick={() => onNavigate("board")}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px 22px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <img src="/brand/mark-star-white.svg" alt="" style={{ width: 24, height: 24 }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14.5, letterSpacing: "0.05em", color: "#fff", textTransform: "uppercase" }}>
            CLG OS
          </span>
          <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 600, fontSize: 9, letterSpacing: "0.14em", color: "var(--clg-mercury)", textTransform: "uppercase" }}>
            Fleet &amp; Operations
          </span>
        </div>
      </button>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px", display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map((group) => (
          <div key={group.id}>
            <div style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.15em",
              color: "var(--clg-cool)", textTransform: "uppercase", padding: "0 12px 6px",
            }}>
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "calc(100% - 24px)", margin: "0 12px",
                    padding: "10px 12px", borderRadius: "var(--clg-radius-md)", border: "none", cursor: "pointer", textAlign: "left",
                    background: active ? "var(--clg-royal)" : "transparent",
                    color: active ? "#fff" : "var(--clg-mercury)",
                    fontFamily: "var(--clg-font-body)", fontWeight: active ? 600 : 500, fontSize: 13.5,
                  }}
                >
                  <item.Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 20px 0", marginTop: 12, borderTop: "1px solid rgba(255,255,255,.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "var(--clg-radius-sm)", background: "var(--clg-reflection)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, color: "var(--clg-navy)",
          }}>
            {initialsFor(email)}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 11.5, color: "var(--clg-moon)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {email}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => onNavigate("settings")} title="Settings" style={iconButtonStyle()}>
              <Settings size={14} />
            </button>
          )}
          <button onClick={() => supabase.auth.signOut()} title="Sign out" style={iconButtonStyle()}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
