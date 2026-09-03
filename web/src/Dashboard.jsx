import { useState } from "react";
import { LogOut, Plus, Settings } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useProfile } from "./hooks/useProfile";
import Board from "./components/board/Board";
import SpendView from "./components/SpendView";
import VendorsView from "./components/vendors/VendorsView";
import UnitsView from "./components/units/UnitsView";
import WorkOrdersView from "./components/workorders/WorkOrdersView";
import IntakeWizard from "./components/intake/IntakeWizard";
import OperationsView from "./components/OperationsView";
import SettingsView from "./components/settings/SettingsView";
import RosterView from "./components/roster/RosterView";
import HomeTimeView from "./components/roster/HomeTimeView";
import TrackingView from "./components/tracking/TrackingView";
import ReloadsView from "./components/reloads/ReloadsView";
import MechanicView from "./components/mechanic/MechanicView";
import "./ds/tokens.css";

// Grouped so related views sit together instead of one flat row — each
// group renders with a visible divider between it and the next. Sentence
// case (not tracked uppercase) per the CLG-OS-Design-Package nav spec.
// "Mechanic" is appended separately below (mechanic/admin only), since
// every other tab here is visible to all authenticated users.
const NAV_GROUPS = [
  { id: "overview", items: [{ id: "board", label: "Board" }, { id: "tracking", label: "Tracking" }, { id: "reloads", label: "Reloads" }, { id: "operations", label: "Operations" }] },
  { id: "work", items: [{ id: "workorders", label: "Work orders" }] },
  { id: "fleet", items: [{ id: "spend", label: "Spend" }, { id: "units", label: "Units" }, { id: "vendors", label: "Vendors" }] },
  { id: "driver", items: [{ id: "roster", label: "Roster" }, { id: "hometime", label: "Home time" }] },
];

function NavDivider() {
  return <div style={{ width: 1, height: 24, background: "var(--clg-moon)" }} />;
}

function initialsFor(email) {
  return (email || "").split("@")[0].slice(0, 2).toUpperCase();
}

export default function Dashboard({ session }) {
  const [tab, setTab] = useState("board");
  const [woInitialCategory, setWoInitialCategory] = useState(null);
  const { profile, isAdmin } = useProfile(session.user.id);
  const isMechanic = profile?.role === "mechanic";
  const canUseMechanicQueue = isMechanic || isAdmin;

  const navGroups = canUseMechanicQueue
    ? [...NAV_GROUPS, { id: "mechanic", items: [{ id: "mechanic", label: "Mechanic" }] }]
    : NAV_GROUPS;

  const goToWorkOrders = (category) => {
    setWoInitialCategory(category ?? null);
    setTab("workorders");
  };

  return (
    <div className="app" style={{ minHeight: "100vh", background: "var(--clg-surface-subtle)" }}>
      <div style={{
        background: "var(--clg-surface-card)", height: 60, display: "flex", alignItems: "center",
        padding: "0 24px", gap: 24, boxShadow: "var(--clg-shadow-appbar)", position: "relative", zIndex: 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/brand/mark-star.svg" alt="" style={{ width: 24, height: 24 }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14,
              letterSpacing: "0.1em", color: "var(--clg-navy)", textTransform: "uppercase",
            }}>
              CLG OS
            </span>
            <span style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 600, fontSize: 9,
              letterSpacing: "0.12em", color: "var(--clg-cool)", textTransform: "uppercase",
            }}>
              Fleet &amp; Operations
            </span>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {navGroups.map((group, i) => (
            <div key={group.id} style={{ display: "flex", alignItems: "center", gap: 28 }}>
              {i > 0 && <NavDivider />}
              <div style={{ display: "flex", gap: 16 }}>
                {group.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      fontFamily: "var(--clg-font-heading)", fontWeight: tab === n.id ? 600 : 500, fontSize: 14,
                      color: tab === n.id ? "var(--clg-navy)" : "var(--clg-pewter)",
                      padding: "19px 2px", boxShadow: tab === n.id ? "inset 0 -2px 0 var(--clg-navy)" : "none",
                      transition: "color .12s",
                    }}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={() => setTab("intake")}
          style={{
            marginLeft: 4, display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
            background: "var(--clg-royal)", border: "none",
            borderRadius: "var(--clg-radius-md)", padding: "9px 16px",
            fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11.5,
            color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em",
          }}
        >
          <Plus size={13} /> New Work Order
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12.5, color: "var(--clg-cool)" }}>{session.user.email}</span>
          {isAdmin && (
            <button
              onClick={() => setTab("settings")}
              title="Settings"
              style={{ background: "transparent", border: "none", color: tab === "settings" ? "var(--clg-navy)" : "var(--clg-cool)", cursor: "pointer", display: "flex" }}
            >
              <Settings size={16} />
            </button>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sign out"
            style={{ background: "transparent", border: "none", color: "var(--clg-cool)", cursor: "pointer", display: "flex" }}
          >
            <LogOut size={16} />
          </button>
          <div style={{
            width: 28, height: 28, borderRadius: "var(--clg-radius-sm)", background: "var(--clg-moon)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, color: "var(--clg-navy)",
          }}>
            {initialsFor(session.user.email)}
          </div>
        </div>
      </div>

      {tab === "board" && <Board onGoToUnits={() => setTab("units")} />}
      {tab === "tracking" && <TrackingView />}
      {tab === "reloads" && <ReloadsView />}
      {tab === "workorders" && <WorkOrdersView initialCategory={woInitialCategory} />}
      {tab === "intake" && <IntakeWizard onDone={() => setTab("board")} />}
      {tab === "spend" && <SpendView onGoToWorkOrders={goToWorkOrders} onGoToUnits={() => setTab("units")} />}
      {tab === "operations" && <OperationsView />}
      {tab === "units" && <UnitsView />}
      {tab === "vendors" && <VendorsView />}
      {tab === "roster" && <RosterView session={session} />}
      {tab === "hometime" && <HomeTimeView session={session} />}
      {tab === "mechanic" && canUseMechanicQueue && <MechanicView />}
      {tab === "settings" && isAdmin && <SettingsView />}
    </div>
  );
}
