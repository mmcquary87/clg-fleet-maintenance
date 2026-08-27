import { useState } from "react";
import { LogOut, Plus } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import Board from "./components/board/Board";
import SpendView from "./components/SpendView";
import VendorsView from "./components/vendors/VendorsView";
import UnitsView from "./components/units/UnitsView";
import WorkOrdersView from "./components/workorders/WorkOrdersView";
import IntakeWizard from "./components/intake/IntakeWizard";
import OperationsView from "./components/OperationsView";
import "./ds/tokens.css";

// Grouped so related views sit together instead of one flat row — each
// group renders with a visible divider between it and the next.
const NAV_GROUPS = [
  { id: "overview", items: [{ id: "board", label: "Board" }, { id: "operations", label: "Operations" }] },
  { id: "work", items: [{ id: "workorders", label: "Work Orders" }] },
  { id: "fleet", items: [{ id: "spend", label: "Spend" }, { id: "units", label: "Units" }, { id: "vendors", label: "Vendors" }] },
];

function NavDivider() {
  return <div style={{ width: 1, height: 24, background: "rgba(255,255,255,.32)" }} />;
}

export default function Dashboard({ session }) {
  const [tab, setTab] = useState("board");

  return (
    <div className="app" style={{ minHeight: "100vh", background: "var(--clg-surface-subtle)" }}>
      <div style={{
        background: "var(--clg-navy)", height: 60, display: "flex", alignItems: "center",
        padding: "0 24px", gap: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/brand/mark-star-white.svg" alt="" style={{ width: 24, height: 24 }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14,
              letterSpacing: "0.1em", color: "#fff", textTransform: "uppercase",
            }}>
              CLG OS
            </span>
            <span style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 600, fontSize: 9,
              letterSpacing: "0.12em", color: "var(--clg-mercury)", textTransform: "uppercase",
            }}>
              Fleet &amp; Operations
            </span>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {NAV_GROUPS.map((group, i) => (
            <div key={group.id} style={{ display: "flex", alignItems: "center", gap: 28 }}>
              {i > 0 && <NavDivider />}
              <div style={{ display: "flex", gap: 12 }}>
                {group.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5,
                      color: tab === n.id ? "#fff" : "var(--clg-mercury)",
                      padding: "19px 2px", borderBottom: tab === n.id ? "2px solid var(--clg-scarlet)" : "2px solid transparent",
                      textTransform: "uppercase", letterSpacing: "0.04em",
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
            background: tab === "intake" ? "var(--clg-scarlet)" : "rgba(255,255,255,.08)",
            border: "1px solid " + (tab === "intake" ? "var(--clg-scarlet)" : "rgba(255,255,255,.16)"),
            borderRadius: "var(--clg-radius-pill)", padding: "7px 14px",
            fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11.5,
            color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em",
          }}
        >
          <Plus size={13} /> New Work Order
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12.5, color: "var(--clg-mercury)" }}>{session.user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Sign out"
            style={{ background: "transparent", border: "none", color: "var(--clg-mercury)", cursor: "pointer", display: "flex" }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {tab === "board" && <Board />}
      {tab === "workorders" && <WorkOrdersView />}
      {tab === "intake" && <IntakeWizard onDone={() => setTab("board")} />}
      {tab === "spend" && <SpendView />}
      {tab === "operations" && <OperationsView />}
      {tab === "units" && <UnitsView />}
      {tab === "vendors" && <VendorsView />}
    </div>
  );
}
