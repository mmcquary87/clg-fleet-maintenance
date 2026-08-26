import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { AlertTriangle, FileText } from "lucide-react";

const RECORDS = [
  { unit: "100143", linkedTractor: "3429", category: "Tires", vendor: "Speedco", location: "Brunswick, GA", cost: 722.99, dateOpened: "2026-08-25", dateClosed: "2026-08-26", invoiceRef: "4010677669", serviceType: "Roadside", failureReason: "Sidewall blown (RFI)", description: "Roadside trailer tire blowout — Darien, GA" },
  { unit: "30323", linkedTractor: "30323", category: "Tires", vendor: "Love's TruckCare", location: "Calhoun, GA", cost: 359.89, dateOpened: "2026-08-24", dateClosed: "2026-08-26", invoiceRef: "4010672514", serviceType: "In Shop", failureReason: "Left front inside blown", description: "In-shop tire replacement" },
  { unit: "012042", linkedTractor: null, category: "Tires", vendor: "Love's Travel Stops #00470", location: "Jasper, FL", cost: 742.72, dateOpened: "2026-08-25", dateClosed: "2026-08-26", invoiceRef: "4010679779", serviceType: "Roadside", failureReason: "Sidewall damage — flat at weigh station", description: "Roadside tire replacement" },
  { unit: "448353", linkedTractor: "3309", category: "Trailer / Body", note: "+ DOT Inspection", vendor: "Love's Travel Stops #00802", location: "Milton, FL", cost: 339.37, dateOpened: "2026-08-25", dateClosed: "2026-08-26", invoiceRef: "4010678501", serviceType: "In Shop", failureReason: "Bent mud flap bracket", description: "Mud flap replacement, bracket repair, DOT inspection" },
  { unit: "33046", linkedTractor: null, category: "Tires", vendor: "Speedco", location: "Jackson, GA", cost: 652.38, dateOpened: "2026-08-25", dateClosed: "2026-08-26", invoiceRef: "4010685207", serviceType: "In Shop", failureReason: "Right front inside blown — tire separation", description: "In-shop tire replacement (Hancock brand)" },
];

const CAT_COLORS = { "Tires": "#C1432B", "Trailer / Body": "#3D6B8C" };

export default function RealInvoiceDashboard() {
  const totalSpend = RECORDS.reduce((s, r) => s + r.cost, 0);
  const tireFailures = RECORDS.filter(r => r.category === "Tires").length;

  const byCategory = useMemo(() => {
    const m = {};
    RECORDS.forEach(r => { m[r.category] = (m[r.category] || 0) + r.cost; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, []);

  const byUnit = useMemo(() => {
    return RECORDS.map(r => ({ name: r.unit, value: r.cost })).sort((a, b) => b.value - a.value);
  }, []);

  return (
    <div className="app">
      <style>{`
        .app { --bg: #EDEEEA; --surface: #FFFFFF; --ink: #1C2126; --ink-soft: #656B63; --line: #D7D9D4; --amber: #E8A33D; --red: #C1432B; --blue: #3D6B8C;
          font-family: 'IBM Plex Sans', -apple-system, sans-serif; background: var(--bg); color: var(--ink); padding: 4px 0 20px; }
        .app * { box-sizing: border-box; }
        .insight { display: flex; gap: 10px; background: #FCEBEB; border: 1px solid var(--red); border-radius: 6px; padding: 11px 14px; margin-bottom: 16px; }
        .insight-title { font-size: 12.5px; font-weight: 600; color: #791F1F; margin-bottom: 2px; }
        .insight-body { font-size: 12px; color: #791F1F; line-height: 1.5; }
        h2 { font-size: 17px; font-weight: 600; margin: 0 0 12px; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        .stat { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--amber); border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; }
        .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 19px; }
        .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .chart-card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
        .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); background: #F4F5F2; }
        td { padding: 9px 10px; font-size: 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .soft { color: var(--ink-soft); }
        .tag { font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; display: inline-block; }
        .tag.tires { background: #FAECE7; color: #712B13; }
        .tag.body { background: #E6F1FB; color: #0C447C; }
      `}</style>

      <div className="insight">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="insight-title">Pattern flag: 4 of 5 work orders are tire failures</div>
          <div className="insight-body">All closed 8/26/2026, opened 8/24–8/25, across four different terminals (Brunswick GA, Calhoun GA, Jasper FL, Jackson GA). Worth checking whether these trailers share a tire brand/batch, inflation schedule, or age — this many blowouts in a 48-hour window across separate locations isn't typical wear-and-tear noise.</div>
        </div>
      </div>

      <h2>Maintenance spend — 5 closed work orders</h2>
      <div className="stats">
        <div className="stat" style={{ borderLeftColor: "var(--red)" }}>
          <span className="stat-label">Total spend</span>
          <span className="stat-value">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Work orders</span>
          <span className="stat-value">{RECORDS.length}</span>
        </div>
        <div className="stat" style={{ borderLeftColor: "var(--blue)" }}>
          <span className="stat-label">Units affected</span>
          <span className="stat-value">{RECORDS.length}</span>
        </div>
        <div className="stat" style={{ borderLeftColor: "var(--red)" }}>
          <span className="stat-label">Tire failures</span>
          <span className="stat-value">{tireFailures} / {RECORDS.length}</span>
        </div>
      </div>

      <div className="charts">
        <div className="chart-card">
          <div className="chart-title">Spend by category</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byCategory} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {byCategory.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name] || "#888"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">Spend by unit (trailer #)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byUnit} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--line)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "var(--ink)" }} width={60} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
              <Bar dataKey="value" fill="var(--amber)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Trailer #</th><th>Category</th><th>Vendor / location</th><th>Failure / reason</th><th>Invoice</th><th>Closed</th><th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {RECORDS.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.unit}{r.linkedTractor && <div className="soft" style={{ fontSize: 10 }}>w/ tractor {r.linkedTractor}</div>}</td>
              <td>
                <span className={"tag " + (r.category === "Tires" ? "tires" : "body")}>{r.category}</span>
                {r.note && <div className="soft" style={{ fontSize: 10.5, marginTop: 3 }}>{r.note}</div>}
              </td>
              <td>{r.vendor}<div className="soft" style={{ fontSize: 10.5 }}>{r.location} · {r.serviceType}</div></td>
              <td>{r.failureReason}</td>
              <td className="mono soft">{r.invoiceRef}</td>
              <td className="mono">{r.dateClosed}</td>
              <td className="mono">${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
