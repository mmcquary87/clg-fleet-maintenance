import { useEffect, useState } from "react";
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
import InsuranceView from "./components/insurance/InsuranceView";
import AnnualInspectionComplianceView from "./components/compliance/AnnualInspectionComplianceView";
import RecruitingView from "./components/recruiting/RecruitingView";
import CopilotWidget from "./components/copilot/CopilotWidget";
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
  insurance: { group: "Fleet", page: "Insurance" },
  annualCompliance: { group: "Fleet", page: "Annual Inspections" },
  roster: { group: "Drivers", page: "Drivers" },
  hometime: { group: "Drivers", page: "Home time" },
  mechanic: { group: "Shop", page: "Mechanic queue" },
  recruitingLeads: { group: "Recruiting", page: "Leads" },
  settings: { group: "Admin", page: "Settings" },
};

// Remembers the last tab across a browser refresh -- Dashboard has no
// router (per CLAUDE.md, plain useState tab switching), so a reload used
// to always remount back to "board" no matter what page you were on.
// Per-browser convenience only, not shared/critical state, so
// localStorage is fine; falls back to "board" for a first visit, a
// cleared/blocked store, or a stored tab that no longer exists.
const LAST_TAB_STORAGE_KEY = "clg_dashboard_last_tab";

function initialTab() {
  try {
    const stored = localStorage.getItem(LAST_TAB_STORAGE_KEY);
    return stored && PAGE_META[stored] ? stored : "board";
  } catch {
    return "board";
  }
}

export default function Dashboard({ session }) {
  const [tab, setTab] = useState(initialTab);
  const [woInitialCategory, setWoInitialCategory] = useState(null);
  const { profile, isAdmin, canUseMechanicQueue } = useProfile(session.user.id);
  const isMechanic = profile?.role === "mechanic";
  const isRecruiter = profile?.role === "recruiter";
  // A pure recruiter account (not also admin) only ever sees the
  // Recruiting nav group (Sidebar enforces that), so pin its content here
  // too regardless of what's in localStorage/state -- otherwise a stale
  // "board" tab from a previous session, or the sidebar logo's hard-coded
  // onNavigate("board"), would render fleet-maintenance content a
  // recruiter shouldn't have access to.
  const effectiveTab = isRecruiter && !isAdmin ? "recruitingLeads" : tab;

  useEffect(() => {
    try { localStorage.setItem(LAST_TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  const goToWorkOrders = (category) => {
    setWoInitialCategory(category ?? null);
    setTab("workorders");
  };

  const { group, page } = PAGE_META[effectiveTab] ?? { group: "", page: "" };

  return (
    <div className="app" style={{ display: "flex", minHeight: "100vh", background: "var(--clg-surface-subtle)" }}>
      <Sidebar tab={effectiveTab} onNavigate={setTab} canUseMechanicQueue={canUseMechanicQueue} isAdmin={isAdmin} isMechanic={isMechanic} isRecruiter={isRecruiter} email={session.user.email} />

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

          {effectiveTab !== "intake" && !isRecruiter && (
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
          {effectiveTab === "board" && <Board onGoToUnits={() => setTab("units")} />}
          {effectiveTab === "tracking" && <TrackingView />}
          {effectiveTab === "reloads" && <ReloadsView />}
          {effectiveTab === "workorders" && <WorkOrdersView initialCategory={woInitialCategory} isAdmin={isAdmin} />}
          {effectiveTab === "intake" && <IntakeWizard onDone={() => setTab("board")} />}
          {effectiveTab === "spend" && (
            <SpendView
              onGoToWorkOrders={goToWorkOrders}
              onGoToUnits={() => setTab("units")}
              canViewAssetLifecycle={profile?.role !== "mechanic"}
            />
          )}
          {effectiveTab === "operations" && <OperationsView />}
          {effectiveTab === "units" && <UnitsView canViewAssetLifecycle={profile?.role !== "mechanic"} />}
          {effectiveTab === "vendors" && <VendorsView />}
          {effectiveTab === "insurance" && !isMechanic && <InsuranceView onGoToUnits={() => setTab("units")} />}
          {effectiveTab === "annualCompliance" && <AnnualInspectionComplianceView onGoToWorkOrders={goToWorkOrders} onGoToUnits={() => setTab("units")} />}
          {effectiveTab === "roster" && <RosterView session={session} />}
          {effectiveTab === "hometime" && <HomeTimeView session={session} />}
          {effectiveTab === "mechanic" && canUseMechanicQueue && <MechanicView />}
          {effectiveTab === "recruitingLeads" && (isRecruiter || isAdmin) && <RecruitingView />}
          {effectiveTab === "settings" && isAdmin && <SettingsView />}
        </div>
      </div>

      <CopilotWidget />
    </div>
  );
}
