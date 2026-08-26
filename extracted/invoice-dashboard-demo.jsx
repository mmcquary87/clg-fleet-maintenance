import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { FileText, TrendingUp, Wrench, Sparkles } from "lucide-react";

const CAT_COLORS = { "Tires": "#C1432B", "PM / Oil": "#E8A33D", "Brakes": "#4C7A54", "Engine": "#3D6B8C", "DOT Inspection": "#8B5A8C" };

const RECORDS = [
  { id: "real-1", unit: "TR-100143", unitType: "Trailer", category: "Tires", vendor: "Speedco (Love's Travel Stops)", cost: 722.99, dateOpened: "2026-08-25", dateClosed: "2026-08-26", invoiceRef: "4010677669", description: "Roadside trailer tire blowout — Darien, GA", real: true },
  { id: "sim-1", unit: "T-3429", unitType: "Truck", category: "PM / Oil", vendor: "Loop Diesel Repair", cost: 410.00, dateOpened: "2026-06-02", dateClosed: "2026-06-02", invoiceRef: "INV-3381", description: "90k mile PM service", real: false },
  { id: "sim-2", unit: "T-3429", unitType: "Truck", category: "Brakes", vendor: "Loop Diesel Repair", cost: 620.00, dateOpened: "2026-07-05", dateClosed: "2026-07-06", invoiceRef: "INV-3419", description: "Rear brake pads + drums", real: false },
  { id: "sim-3", unit: "TR-100143", unitType: "Trailer", category: "DOT Inspection", vendor: "Midwest Fleet Services", cost: 150.00, dateOpened: "2026-07-15", dateClosed: "2026-07-15", invoiceRef: "INV-3440", description: "Annual DOT inspection", real: false },
  { id: "sim-4", unit: "T-5629", unitType: "Truck", category: "Engine", vendor: "Loop Diesel Repair", cost: 890.00, dateOpened: "2026-04-20", dateClosed: "2026-04-21", invoiceRef: "INV-3402", description: "Check engine light — sensor replacement", real: false },
  { id: "sim-5", unit: "T-5629", unitType: "Truck", category: "Tires", vendor: "Speedco (Love's Travel Stops)", cost: 610.50, dateOpened: "2026-05-10", dateClosed: "2026-05-10", invoiceRef: "4009812204", description: "Steer tire replacement", real: false },
  { id: "sim-6", unit: "T-3429", unitType: "Truck", category: "PM / Oil", vendor: "Loop Diesel Repair", cost: 395.00, dateOpened: "2026-08-01", dateClosed: "2026-08-01", invoiceRef: "INV-3455", description: "Scheduled PM service", real: false },
  { id: "sim-7", unit: "TR-100143", unitType: "Trailer", category: "Tires", vendor: "Speedco (Love's Travel Stops)", cost: 458.20, dateOpened: "2026-03-12", dateClosed: "2026-03-12", invoiceRef: "4008601175", description: "Trailer tire replacement (non-roadside)", real: false },
];

function Stat({ label, value, accent }) {
  return (
    <div className="stat" style={{ borderLeftColor: accent || "var(--amber)" }}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export default function InvoiceDashboardDemo() {
  const [showAll, setShowAll] = useState(true);
  const records = showAll ? RECORDS : RECORDS.filter(r => r.real);

  const totalSpend = records.reduce((s, r) => s + r.cost, 0);
  const byCategory = useMemo(() => {
    const m = {};
    records.forEach(r => { m[r.category] = (m[r.category] || 0) + r.cost; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [records]);
  const byUnit = useMemo(() => {
    const m = {};
    records.forEach(r => { m[r.unit] = (m[r.unit] || 0) + r.cost; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [records]);
  const byMonth = useMemo(() => {
    const m = {};
    records.forEach(r => {
      const d = new Date(r.dateClosed);
      const key = d.toLocaleString("en-US", { month: "short" });
      m[key] = (m[key] || 0) + r.cost;
    });
    const order = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return order.filter(k => m[k]).map(k => ({ name: k, value: m[k] }));
  }, [records]);

  return (
    <div className="app">
      <style>{`
        .app { --bg: #EDEEEA; --surface: #FFFFFF; --ink: #1C2126; --ink-soft: #656B63; --line: #D7D9D4; --amber: #E8A33D; --red: #C1432B;
          font-family: 'IBM Plex Sans', -apple-system, sans-serif; background: var(--bg); color: var(--ink); padding: 4px 0 24px; }
        .app * { box-sizing: border-box; }
        .banner { display: flex; align-items: center; gap: 8px; background: #FFF7E8; border: 1px solid var(--amber); border-radius: 6px; padding: 10px 14px; font-size: 12.5px; color: #6B4B0B; margin-bottom: 16px; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .toolbar h2 { font-size: 17px; font-weight: 600; margin: 0; }
        .toggle-btn { font-size: 12.5px; font-weight: 500; border: 1px solid var(--line); background: var(--surface); border-radius: 5px; padding: 6px 11px; cursor: pointer; color: var(--ink-soft); }
        .toggle-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
        .stat { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid; border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .stat-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; }
        .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; }
        .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .chart-card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
        .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
        .list { display: flex; flex-direction: column; gap: 8px; }
        .row { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
        .row.real { border-color: var(--amber); background: #FFFBF3; }
        .badge { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; }
        .badge.real { background: var(--amber); color: #4A3200; }
        .badge.sim { background: var(--line); color: var(--ink-soft); }
        .row-main { flex: 1; min-width: 0; }
        .row-title { font-size: 13px; font-weight: 500; }
        .row-sub { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; }
        .row-cost { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 500; }
      `}</style>

      <div className="banner">
        <Sparkles size={14} />
        Simulated dashboard — one entry (marked "Real") came from your uploaded invoice; the rest are sample data to show how the dashboard fills in over time.
      </div>

      <div className="toolbar">
        <h2>Maintenance spend</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={"toggle-btn" + (!showAll ? " active" : "")} onClick={() => setShowAll(false)}>Just this invoice</button>
          <button className={"toggle-btn" + (showAll ? " active" : "")} onClick={() => setShowAll(true)}>With sample data</button>
        </div>
      </div>

      <div className="stats">
        <Stat label="Total spend" value={`$${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} accent="var(--amber)" />
        <Stat label="Work orders" value={records.length} accent="var(--red)" />
        <Stat label="Units affected" value={new Set(records.map(r => r.unit)).size} accent="#3D6B8C" />
      </div>

      {showAll && (
        <div className="charts">
          <div className="chart-card">
            <div className="chart-title">Spend by category</div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={byCategory} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} interval={0} angle={-15} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {byCategory.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name] || "#888"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <div className="chart-title">Spend by unit</div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={byUnit} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink)" }} width={70} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Bar dataKey="value" fill="var(--amber)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card" style={{ gridColumn: "1 / -1" }}>
            <div className="chart-title">Spend over time</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={byMonth} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="value" stroke="#3D6B8C" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="list">
        {records.slice().sort((a, b) => b.dateClosed.localeCompare(a.dateClosed)).map(r => (
          <div className={"row" + (r.real ? " real" : "")} key={r.id}>
            <span className={"badge" + (r.real ? " real" : " sim")}>{r.real ? "Real" : "Sample"}</span>
            <div className="row-main">
              <div className="row-title">{r.unit} · {r.category} · {r.vendor}</div>
              <div className="row-sub">{r.description} — {r.dateClosed}{r.invoiceRef ? ` — Ref ${r.invoiceRef}` : ""}</div>
            </div>
            <div className="row-cost">${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
