import { useState } from "react";
import { Plus } from "lucide-react";
import { useProfile } from "./hooks/useProfile";
import Sidebar from "./components/Sidebar";
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

// Group/page labels for the top bar's breadcrumb -- one global "New work
// order" CTA lives there instead (per the design_handoff shell spec), so no
// page header repeats it.
const PAGE_META = {
  board: { group: "Overview", page: "Board" },
  tracking: { group: "Overview", page: "Tracking" },
  reloads: { group: "Overview", page: "Reloads" },
  operations: { group: "Overview", page: "Operations" },
  workorders: { group: "Work", page: "Work orders" },
  intake: { group: "Work", page: "New work order" },
  spend: { group: "Fleet", page: "Spend" },
  units: { group: "Fleet", page: "Units" },
  vendors: { group: "Fleet", page: "Vendors" },
  roster: { group: "Drivers", page: "Drivers" },
  hometime: { group: "Drivers", page: "Home time" },
  mechanic: { group: "Mechanic", page: "Mechanic" },
  settings: { group: "Admin", page: "Settings" },
};

export default function Dashboard({ session }) {
  const [tab, setTab] = useState("board");
  const [woInitialCategory, setWoInitialCategory] = useState(null);
  const { profile, isAdmin } = useProfile(session.user.id);
  const isMechanic = profile?.role === "mechanic";
  const canUseMechanicQueue = isMechanic || isAdmin;

  const goToWorkOrders = (category) => {
    setWoInitialCategory(category ?? null);
    setTab("workorders");
  };

  const { group, page } = PAGE_META[tab] ?? { group: "", page: "" };

  return (
    <div className="app" style={{ display: "flex", minHeight: "100vh", background: "var(--clg-surface-subtle)" }}>
      <Sidebar tab={tab} onNavigate={setTab} canUseMechanicQueue={canUseMechanicQueue} isAdmin={isAdmin} email={session.user.email} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          height: 64, flexShrink: 0, background: "#fff", boxShadow: "0 1px 0 rgba(34,59,98,.08)",
          position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", padding: "0 28px",
        }}>
          <span style={{ fontSize: 13, color: "var(--clg-pewter)" }}>
            {group}
            <span style={{ margin: "0 6px", color: "var(--clg-moon)" }}>/</span>
          </span>
          <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 600, fontSize: 14, color: "var(--clg-navy)" }}>{page}</span>

          {tab !== "intake" && (
            <button
              onClick={() => setTab("intake")}
              style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                background: "var(--clg-scarlet)", border: "none",
                borderRadius: "var(--clg-radius-md)", padding: "9px 16px",
                fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11.5,
                color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em",
              }}
            >
              <Plus size={13} /> New Work Order
            </button>
          )}
        </div>

        <div style={{ flex: 1 }}>
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
      </div>
    </div>
  );
}
