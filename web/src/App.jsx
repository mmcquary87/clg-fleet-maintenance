import { useState } from "react";
import { Building2, LayoutGrid, Loader2, Wrench, RefreshCw } from "lucide-react";
import { useWorkOrders } from "./hooks/useWorkOrders";
import CompanyView from "./components/CompanyView";
import UnitView from "./components/UnitView";
import "./App.css";

export default function App() {
  const [view, setView] = useState("company");
  const { records, loading, error, reload } = useWorkOrders();

  return (
    <div className="app">
      <div className="header">
        <div className="header-title">
          <Wrench size={20} strokeWidth={2} />
          <div>
            <h1>Fleet Maintenance</h1>
            <div className="header-sub">CLG Transportation · spend dashboard</div>
          </div>
        </div>
        <button className="refresh-btn" onClick={reload} disabled={loading} title="Reload from Supabase">
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </div>

      <div className="content">
        <div className="toggle-row">
          <button className={"toggle-btn" + (view === "company" ? " active" : "")} onClick={() => setView("company")}>
            <Building2 size={14} /> Company
          </button>
          <button className={"toggle-btn" + (view === "unit" ? " active" : "")} onClick={() => setView("unit")}>
            <LayoutGrid size={14} /> By unit
          </button>
        </div>

        {error && (
          <div className="banner warn">
            <div>
              <div className="banner-title">Couldn't load data from Supabase</div>
              <div className="banner-body">{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading"><Loader2 size={16} className="spin" /> Loading fleet data…</div>
        ) : !error && (
          view === "company" ? <CompanyView records={records} /> : <UnitView records={records} />
        )}
      </div>
    </div>
  );
}
