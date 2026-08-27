import { useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import Board from "./components/board/Board";
import SpendView from "./components/SpendView";
import VendorsView from "./components/vendors/VendorsView";
import IntakeWizard from "./components/intake/IntakeWizard";
import "./ds/tokens.css";

const NAV = [
  { id: "board", label: "Board" },
  { id: "intake", label: "New Work Order" },
  { id: "spend", label: "Spend" },
  { id: "vendors", label: "Vendors" },
];

export default function Dashboard({ session }) {
  const [tab, setTab] = useState("board");

  return (
    <div className="app" style={{ minHeight: "100vh", background: "var(--clg-surface-subtle)" }}>
      <div style={{
        background: "var(--clg-navy)", height: 56, display: "flex", alignItems: "center",
        padding: "0 24px", gap: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/brand/mark-star-white.svg" alt="" style={{ width: 22, height: 22 }} />
          <span style={{
            fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.14em", color: "#fff", textTransform: "uppercase",
          }}>
            CLG Maintenance
          </span>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12.5,
                color: tab === n.id ? "#fff" : "var(--clg-mercury)",
                padding: "18px 4px", borderBottom: tab === n.id ? "2px solid var(--clg-scarlet)" : "2px solid transparent",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}
            >
              {n.label}
            </button>
          ))}
        </nav>

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
      {tab === "intake" && <IntakeWizard onDone={() => setTab("board")} />}
      {tab === "spend" && <SpendView />}
      {tab === "vendors" && <VendorsView />}
    </div>
  );
}
