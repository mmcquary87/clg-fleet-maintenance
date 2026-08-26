import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { Truck, AlertTriangle, ShieldAlert, Building2, LayoutGrid } from "lucide-react";

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

function groupSum(records, key) {
  const m = {};
  records.forEach(r => { m[r[key]] = (m[r[key]] || 0) + r.cost; });
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export default function FleetDashboard() {
  const [view, setView] = useState("company");

  const units = useMemo(() => {
    const m = {};
    RECORDS.forEach(r => {
      if (!m[r.unit]) m[r.unit] = { unit: r.unit, total: 0, count: 0, categories: new Set() };
      m[r.unit].total += r.cost;
      m[r.unit].count += 1;
      m[r.unit].categories.add(r.category);
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, []);

  const [selected, setSelected] = useState(units[0].unit);
  const selectedRecords = RECORDS.filter(r => r.unit === selected);
  const selectedTotal = selectedRecords.reduce((s, r) => s + r.cost, 0);
  const selectedByCategory = useMemo(() => groupSum(selectedRecords, "category"), [selected]);

  const grandTotal = RECORDS.reduce((s, r) => s + r.cost, 0);
  const companyByCategory = useMemo(() => groupSum(RECORDS, "category"), []);
  const companyByVendor = useMemo(() => groupSum(RECORDS, "vendor"), []);

  return (
    <div className="app">
      <style>{`
        .app { --bg: #EDEEEA; --surface: #FFFFFF; --ink: #1C2126; --ink-soft: #656B63; --line: #D7D9D4; --amber: #E8A33D; --red: #C1432B; --blue: #3D6B8C;
          font-family: 'IBM Plex Sans', -apple-system, sans-serif; background: var(--bg); color: var(--ink); padding: 4px 0 20px; }
        .app * { box-sizing: border-box; }
        .toggle-row { display: flex; gap: 6px; margin-bottom: 16px; }
        .toggle-btn { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; padding: 8px 14px; cursor: pointer; color: var(--ink-soft); }
        .toggle-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
        h2 { font-size: 17px; font-weight: 600; margin: 0 0 14px; }
        .banner { display: flex; gap: 10px; border-radius: 6px; padding: 11px 14px; margin-bottom: 10px; }
        .banner.warn { background: #FCEBEB; border: 1px solid var(--red); }
        .banner-title { font-size: 12.5px; font-weight: 600; margin-bottom: 2px; color: #791F1F; }
        .banner-body { font-size: 12px; line-height: 1.5; color: #791F1F; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        .stat { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--amber); border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; }
        .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 19px; }
        .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .chart-card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
        .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
        .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .card { background: var(--surface); border: 1.5px solid var(--line); border-radius: 8px; padding: 12px; cursor: pointer; text-align: left; }
        .card:hover { border-color: var(--ink-soft); }
        .card.active { border-color: var(--amber); background: #FFFBF3; box-shadow: 0 0 0 1px var(--amber); }
        .card-top { display: flex; align-items: center; gap: 6px; color: var(--ink-soft); margin-bottom: 6px; }
        .card-unit { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 500; color: var(--ink); }
        .card-total { font-family: 'IBM Plex Mono', monospace; font-size: 18px; margin-bottom: 4px; }
        .card-meta { font-size: 10.5px; color: var(--ink-soft); }
        .detail { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px; }
        .detail-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
        .detail-title { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 500; }
        .detail-sub { font-size: 12px; color: var(--ink-soft); margin-bottom: 16px; }
        .detail-total { text-align: right; }
        .detail-total-value { font-family: 'IBM Plex Mono', monospace; font-size: 22px; }
        .detail-total-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); }
        .rows { margin-top: 18px; display: flex; flex-direction: column; gap: 7px; }
        .row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 6px; }
        .row-cat { font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 3px; text-transform: uppercase; color: #fff; flex-shrink: 0; min-width: 78px; text-align: center; }
        .row-main { flex: 1; min-width: 0; }
        .row-desc { font-size: 12.5px; }
        .row-meta { font-size: 11px; color: var(--ink-soft); margin-top: 1px; }
        .row-cost { font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
        .flag { color: var(--red); vertical-align: -2px; margin-left: 4px; }
      `}</style>

      <div className="toggle-row">
        <button className={"toggle-btn" + (view === "company" ? " active" : "")} onClick={() => setView("company")}>
          <Building2 size={14} /> Company
        </button>
        <button className={"toggle-btn" + (view === "unit" ? " active" : "")} onClick={() => setView("unit")}>
          <LayoutGrid size={14} /> By unit
        </button>
      </div>

      {view === "company" ? (
        <>
          <h2>Fleet maintenance spend — company-wide</h2>

          <div className="banner warn">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div className="banner-title">Tire cluster — 4 units, 48-hour window</div>
              <div className="banner-body">Units 100143, 30323, 012042 and 33046 all had tire failures 8/24–8/26 across four different GA/FL terminals. Worth checking tire batch or inflation pattern.</div>
            </div>
          </div>
          <div className="banner warn">
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div className="banner-title">Possible missed warranty — unit 3419, $10,612.57</div>
              <div className="banner-body">Notes reference an NTP warranty, but no claim was applied to this invoice. Worth a follow-up.</div>
            </div>
          </div>

          <div className="stats">
            <div className="stat" style={{ borderLeftColor: "var(--red)" }}>
              <span className="stat-label">Total spend</span>
              <span className="stat-value">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Invoices</span>
              <span className="stat-value">6</span>
            </div>
            <div className="stat" style={{ borderLeftColor: "var(--blue)" }}>
              <span className="stat-label">Units affected</span>
              <span className="stat-value">{units.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Avg / unit</span>
              <span className="stat-value">${(grandTotal / units.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <div className="charts">
            <div className="chart-card">
              <div className="chart-title">Spend by category</div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={companyByCategory} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "var(--ink-soft)" }} interval={0} angle={-20} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                  <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {companyByCategory.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name] || "#888"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <div className="chart-title">Spend by vendor</div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={companyByVendor} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--line)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9.5, fill: "var(--ink)" }} width={130} />
                  <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                  <Bar dataKey="value" fill="var(--amber)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2>Spend by unit — click to drill in</h2>
          <div className="cards">
            {units.map(u => (
              <button key={u.unit} className={"card" + (selected === u.unit ? " active" : "")} onClick={() => setSelected(u.unit)}>
                <div className="card-top"><Truck size={13} /><span className="card-unit">{u.unit}</span></div>
                <div className="card-total">${u.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div className="card-meta">{u.count} item{u.count > 1 ? "s" : ""} · {u.categories.size} categor{u.categories.size > 1 ? "ies" : "y"}</div>
              </button>
            ))}
          </div>

          <div className="detail">
            <div className="detail-head">
              <div>
                <div className="detail-title">Unit {selected}</div>
                <div className="detail-sub">{selectedRecords[0].vendor}</div>
              </div>
              <div className="detail-total">
                <div className="detail-total-value">${selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="detail-total-label">Total spend</div>
              </div>
            </div>

            <div className="chart-title">Categorized breakdown</div>
            <ResponsiveContainer width="100%" height={Math.max(120, selectedByCategory.length * 42)}>
              <BarChart data={selectedByCategory} layout="vertical" margin={{ top: 0, right: 40, left: 4, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--ink)" }} width={90} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, formatter: (v) => `$${Number(v).toLocaleString()}` }}>
                  {selectedByCategory.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name] || "#888"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="rows">
              {selectedRecords.map((r, i) => (
                <div className="row" key={i}>
                  <span className="row-cat" style={{ background: CAT_COLORS[r.category] }}>{r.category}</span>
                  <div className="row-main">
                    <div className="row-desc">{r.desc}{r.flag === "warranty" && <AlertTriangle size={12} className="flag" />}</div>
                    <div className="row-meta">{r.date} · Ref {r.ref}</div>
                  </div>
                  <div className="row-cost">${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
