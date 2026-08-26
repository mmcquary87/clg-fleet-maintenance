import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { AlertTriangle, ShieldAlert, Layers } from "lucide-react";

const RECORDS = [
  { unit: "100143", category: "Tires", vendor: "Speedco — Brunswick, GA", cost: 722.99, date: "2026-08-26", ref: "4010677669", desc: "Roadside trailer tire blowout" },
  { unit: "30323", category: "Tires", vendor: "Love's TruckCare — Calhoun, GA", cost: 359.89, date: "2026-08-26", ref: "4010672514", desc: "In-shop tire replacement" },
  { unit: "012042", category: "Tires", vendor: "Love's #00470 — Jasper, FL", cost: 742.72, date: "2026-08-26", ref: "4010679779", desc: "Roadside tire replacement — sidewall damage" },
  { unit: "448353", category: "Trailer / Body", vendor: "Love's #00802 — Milton, FL", cost: 339.37, date: "2026-08-26", ref: "4010678501", desc: "Mud flap + bracket repair, DOT inspection" },
  { unit: "33046", category: "Tires", vendor: "Speedco — Jackson, GA", cost: 652.38, date: "2026-08-26", ref: "4010685207", desc: "In-shop tire replacement (tire separation)" },
  { unit: "3419", category: "Engine", vendor: "River City Truck Center — Jacksonville, FL", cost: 10612.57, date: "2026-08-24", ref: "RO 5383", desc: "DPF + soot sensor + injector powerpack replacement", flag: "warranty" },
  { unit: "3419", category: "PM / Oil", vendor: "River City Truck Center — Jacksonville, FL", cost: 892.20, date: "2026-08-24", ref: "RO 5383", desc: "PM service — oil, filters, grease" },
  { unit: "3419", category: "Electrical", vendor: "River City Truck Center — Jacksonville, FL", cost: 42.00, date: "2026-08-24", ref: "RO 5383", desc: "Headlight harness inspection" },
  { unit: "3419", category: "Trailer / Body", vendor: "River City Truck Center — Jacksonville, FL", cost: 140.00, date: "2026-08-24", ref: "RO 5383", desc: "Quarter fender repair — labor" },
  { unit: "3419", category: "Electrical", vendor: "River City Truck Center — Jacksonville, FL", cost: 140.00, date: "2026-08-24", ref: "RO 5383", desc: "ABS light diag — brake pressure switch code" },
  { unit: "3419", category: "Other", vendor: "River City Truck Center — Jacksonville, FL", cost: 300.00, date: "2026-08-24", ref: "RO 5383", desc: "3-axle alignment" },
  { unit: "3419", category: "Other", vendor: "River City Truck Center — Jacksonville, FL", cost: 1634.94, date: "2026-08-24", ref: "RO 5383", desc: "Shop supplies, tax, card fee (invoice-level)" },
];

const CAT_COLORS = { "Tires": "#C1432B", "Trailer / Body": "#3D6B8C", "Engine": "#8B5A8C", "PM / Oil": "#E8A33D", "Electrical": "#4C7A54", "Other": "#888780" };

export default function RealInvoiceDashboardV2() {
  const totalSpend = RECORDS.reduce((s, r) => s + r.cost, 0);
  const units = [...new Set(RECORDS.map(r => r.unit))];

  const byCategory = useMemo(() => {
    const m = {};
    RECORDS.forEach(r => { m[r.category] = (m[r.category] || 0) + r.cost; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, []);

  const byUnit = useMemo(() => {
    const m = {};
    RECORDS.forEach(r => { m[r.unit] = (m[r.unit] || 0) + r.cost; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, []);

  const [expandUnit, setExpandUnit] = useState("3419");

  return (
    <div className="app">
      <style>{`
        .app { --bg: #EDEEEA; --surface: #FFFFFF; --ink: #1C2126; --ink-soft: #656B63; --line: #D7D9D4; --amber: #E8A33D; --red: #C1432B; --blue: #3D6B8C; --purple: #8B5A8C;
          font-family: 'IBM Plex Sans', -apple-system, sans-serif; background: var(--bg); color: var(--ink); padding: 4px 0 20px; }
        .app * { box-sizing: border-box; }
        .banner { display: flex; gap: 10px; border-radius: 6px; padding: 11px 14px; margin-bottom: 10px; }
        .banner.warn { background: #FCEBEB; border: 1px solid var(--red); }
        .banner.info { background: #E6F1FB; border: 1px solid var(--blue); }
        .banner-title { font-size: 12.5px; font-weight: 600; margin-bottom: 2px; }
        .banner-body { font-size: 12px; line-height: 1.5; }
        .banner.warn .banner-title, .banner.warn .banner-body { color: #791F1F; }
        .banner.info .banner-title, .banner.info .banner-body { color: #0C447C; }
        h2 { font-size: 17px; font-weight: 600; margin: 16px 0 12px; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        .stat { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--amber); border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; }
        .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 19px; }
        .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .chart-card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
        .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
        .unit-tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
        .unit-tab { font-size: 12px; font-family: 'IBM Plex Mono', monospace; border: 1px solid var(--line); background: var(--surface); border-radius: 5px; padding: 5px 10px; cursor: pointer; color: var(--ink-soft); }
        .unit-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
        table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); background: #F4F5F2; }
        td { padding: 9px 10px; font-size: 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .soft { color: var(--ink-soft); }
        .tag { font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; display: inline-block; color: #fff; }
        .flag-icon { color: var(--red); vertical-align: -2px; margin-left: 4px; }
      `}</style>

      <div className="banner warn">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="banner-title">Tire cluster — 4 of 5 tire-related work orders in a 48-hour window</div>
          <div className="banner-body">Units 100143, 30323, 012042 and 33046 all had tire blowouts/sidewall failures 8/24–8/26, across four different terminals in GA/FL. Worth checking tire batch, brand, or inflation pattern.</div>
        </div>
      </div>

      <div className="banner warn">
        <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="banner-title">Possible missed warranty recovery — unit 3419, $10,612.57</div>
          <div className="banner-body">Repair notes explicitly say "customer has NTP warranty," but the full amount (including a $4,956.35 injector powerpack) was charged to credit card with no warranty claim applied — unlike a comparable failure on the same day at the same shop that WAS covered under NTP. Worth a follow-up call to NTP.</div>
        </div>
      </div>

      <div className="banner info">
        <Layers size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="banner-title">Good consolidation — unit 3419's visit bundled 6 issues into one trip</div>
          <div className="banner-body">Engine repair, PM service, lighting check, fender repair, ABS diag, and an alignment all happened in the same shop visit — exactly the "consolidate shop visits" pattern that minimizes downtime.</div>
        </div>
      </div>

      <h2>Fleet maintenance spend — 12 line items across 6 real invoices</h2>
      <div className="stats">
        <div className="stat" style={{ borderLeftColor: "var(--red)" }}>
          <span className="stat-label">Total spend</span>
          <span className="stat-value">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Invoices</span>
          <span className="stat-value">6</span>
        </div>
        <div className="stat" style={{ borderLeftColor: "var(--blue)" }}>
          <span className="stat-label">Units affected</span>
          <span className="stat-value">{units.length}</span>
        </div>
        <div className="stat" style={{ borderLeftColor: "var(--purple)" }}>
          <span className="stat-label">Largest single job</span>
          <span className="stat-value">$10,612.57</span>
        </div>
      </div>

      <div className="charts">
        <div className="chart-card">
          <div className="chart-title">Spend by category</div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={byCategory} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "var(--ink-soft)" }} interval={0} angle={-20} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
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
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink)" }} width={55} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
              <Bar dataKey="value" fill="var(--amber)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="unit-tabs">
        <button className={"unit-tab" + (expandUnit === "all" ? " active" : "")} onClick={() => setExpandUnit("all")}>All units</button>
        {units.map(u => (
          <button key={u} className={"unit-tab" + (expandUnit === u ? " active" : "")} onClick={() => setExpandUnit(u)}>Unit {u}</button>
        ))}
      </div>

      <table>
        <thead>
          <tr><th>Unit</th><th>Category</th><th>Vendor</th><th>Description</th><th>Date</th><th>Ref</th><th>Cost</th></tr>
        </thead>
        <tbody>
          {RECORDS.filter(r => expandUnit === "all" || r.unit === expandUnit).map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.unit}</td>
              <td><span className="tag" style={{ background: CAT_COLORS[r.category] }}>{r.category}</span></td>
              <td>{r.vendor}</td>
              <td>{r.desc}{r.flag === "warranty" && <AlertTriangle size={12} className="flag-icon" />}</td>
              <td className="mono">{r.date}</td>
              <td className="mono soft">{r.ref}</td>
              <td className="mono">${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
