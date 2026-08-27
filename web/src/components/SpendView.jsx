import { useState } from "react";
import { Building2, LayoutGrid, Loader2, Plus } from "lucide-react";
import { useWorkOrders } from "../hooks/useWorkOrders";
import CompanyView from "./CompanyView";
import UnitView from "./UnitView";
import NewWorkOrderForm from "./NewWorkOrderForm";

export default function SpendView() {
  const [view, setView] = useState("company");
  const [showForm, setShowForm] = useState(false);
  const { records, loading, error, reload } = useWorkOrders();

  return (
    <div className="content">
      <div className="toolbar">
        <div className="toggle-row" style={{ marginBottom: 0 }}>
          <button className={"toggle-btn" + (view === "company" ? " active" : "")} onClick={() => setView("company")}>
            <Building2 size={14} /> Company
          </button>
          <button className={"toggle-btn" + (view === "unit" ? " active" : "")} onClick={() => setView("unit")}>
            <LayoutGrid size={14} /> By unit
          </button>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> New work order
        </button>
      </div>

      {showForm && (
        <NewWorkOrderForm
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}

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
  );
}
