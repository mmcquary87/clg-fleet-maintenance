import { useEffect, useState } from "react";
import { Plus, LogOut } from "lucide-react";
import { useProfile } from "./hooks/useProfile";
import { supabase } from "./lib/supabaseClient";
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

  useEffect(() => {
    try { localStorage.setItem(LAST_TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  const goToWorkOrders = (category) => {
    setWoInitialCategory(category ?? null);
    setTab("workorders");
  };

  const { group, page } = PAGE_META[tab] ?? { group: "", page: "" };

  // The recruiter role exists so an account can be invited ahead of the
  // recruiter-facing UI being built (RECRUITING.md modules 5-7) -- until
  // then, it deliberately doesn't fall through to the normal tab system
  // below, which would otherwise hand a recruiter full dispatcher-level
  // access to fleet maintenance data that isn't their job.
  if (profile?.role === "recruiter") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, background: "var(--clg-surface-subtle)", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: "var(--clg-size-h4)", color: "var(--clg-navy)" }}>
          Owner-Operator Recruiting
        </div>
        <div style={{ fontSize: 13, color: "var(--clg-text-muted)", maxWidth: 360 }}>
          The recruiter dashboard isn't built yet. Check back once lead sourcing and screening are further along.
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--clg-border-default)",
            borderRadius: "var(--clg-radius-sm)", padding: "8px 14px", cursor: "pointer", color: "var(--clg-text-muted)", fontSize: 12.5,
          }}
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="app" style={{ display: "flex", minHeight: "100vh", background: "var(--clg-surface-subtle)" }}>
      <Sidebar tab={tab} onNavigate={setTab} canUseMechanicQueue={canUseMechanicQueue} isAdmin={isAdmin} isMechanic={isMechanic} email={session.user.email} />

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
          {tab === "workorders" && <WorkOrdersView initialCategory={woInitialCategory} isAdmin={isAdmin} />}
          {tab === "intake" && <IntakeWizard onDone={() => setTab("board")} />}
          {tab === "spend" && (
            <SpendView
              onGoToWorkOrders={goToWorkOrders}
              onGoToUnits={() => setTab("units")}
              canViewAssetLifecycle={profile?.role !== "mechanic"}
            />
          )}
          {tab === "operations" && <OperationsView />}
          {tab === "units" && <UnitsView canViewAssetLifecycle={profile?.role !== "mechanic"} />}
          {tab === "vendors" && <VendorsView />}
          {tab === "insurance" && !isMechanic && <InsuranceView onGoToUnits={() => setTab("units")} />}
          {tab === "annualCompliance" && <AnnualInspectionComplianceView onGoToWorkOrders={goToWorkOrders} onGoToUnits={() => setTab("units")} />}
          {tab === "roster" && <RosterView session={session} />}
          {tab === "hometime" && <HomeTimeView session={session} />}
          {tab === "mechanic" && canUseMechanicQueue && <MechanicView />}
          {tab === "settings" && isAdmin && <SettingsView />}
        </div>
      </div>

      <CopilotWidget />
    </div>
  );
}
