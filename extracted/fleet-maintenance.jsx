import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";
import {
  Wrench, Truck, Building2, Plus, X, ClipboardList, TrendingUp,
  AlertCircle, CheckCircle2, Clock, Trash2, Loader2
} from "lucide-react";

const CATEGORIES = [
  "PM / Oil", "Tires", "Brakes", "Engine", "Electrical",
  "Transmission", "Trailer / Body", "DOT Inspection", "Other"
];
const STATUSES = ["Open", "In Progress", "Closed"];
const CAT_COLORS = ["#C1432B","#E8A33D","#4C7A54","#3D6B8C","#8B5A8C","#B5843C","#6B7A8C","#9C6B4C","#5A5F66"];

function uid() { return Math.random().toString(36).slice(2, 10); }

function useStore(key) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(key, true);
        setData(res ? JSON.parse(res.value) : []);
      } catch {
        setData([]);
      }
      setLoading(false);
    })();
  }, [key]);
  const persist = async (next) => {
    setData(next);
    try { await window.storage.set(key, JSON.stringify(next), true); }
    catch (e) { console.error("storage set failed", key, e); }
  };
  return [data, persist, loading];
}

function Stamp({ status }) {
  const map = {
    "Open": { c: "var(--red)", label: "OPEN" },
    "In Progress": { c: "var(--amber)", label: "IN PROGRESS" },
    "Closed": { c: "var(--green)", label: "CLOSED" },
  };
  const s = map[status] || map["Open"];
  return (
    <span className="stamp" style={{ color: s.c, borderColor: s.c }}>{s.label}</span>
  );
}

function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="empty">
      <Icon size={28} strokeWidth={1.5} />
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
      {action}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Dashboard({ workOrders, units, vendors }) {
  const closed = workOrders.filter(w => w.status === "Closed");
  const totalSpend = closed.reduce((s, w) => s + (Number(w.cost) || 0), 0);
  const openCount = workOrders.filter(w => w.status !== "Closed").length;
  const avgCost = closed.length ? totalSpend / closed.length : 0;

  const byCategory = useMemo(() => {
    const m = {};
    closed.forEach(w => { m[w.category] = (m[w.category] || 0) + (Number(w.cost) || 0); });
    return CATEGORIES.map(c => ({ name: c, value: m[c] || 0 })).filter(d => d.value > 0);
  }, [closed]);

  const byUnit = useMemo(() => {
    const m = {};
    closed.forEach(w => {
      const u = units.find(u => u.id === w.unitId);
      const label = u ? u.number : "Unassigned";
      m[label] = (m[label] || 0) + (Number(w.cost) || 0);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [closed, units]);

  const byMonth = useMemo(() => {
    const m = {};
    closed.forEach(w => {
      if (!w.dateClosed) return;
      const d = new Date(w.dateClosed);
      const key = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      m[key] = (m[key] || 0) + (Number(w.cost) || 0);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [closed]);

  if (workOrders.length === 0) {
    return (
      <EmptyState icon={TrendingUp} title="No spend data yet"
        body="Once work orders are logged and closed with a cost, spend breakdowns by unit, category, and month will show up here." />
    );
  }

  return (
    <div className="dash">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Total closed spend</span>
          <span className="kpi-value">${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Open work orders</span>
          <span className="kpi-value" style={{ color: openCount ? "var(--red)" : "var(--ink)" }}>{openCount}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Avg cost / work order</span>
          <span className="kpi-value">${avgCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Units tracked</span>
          <span className="kpi-value">{units.length}</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Spend by category</div>
          {byCategory.length === 0 ? <div className="chart-empty">No closed work orders with cost yet</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} contentStyle={{ fontFamily: "var(--font-body)", fontSize: 12, border: "1px solid var(--line)", borderRadius: 4 }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {byCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Top units by spend</div>
          {byUnit.length === 0 ? <div className="chart-empty">No closed work orders with cost yet</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byUnit} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--ink)" }} width={64} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} contentStyle={{ fontFamily: "var(--font-body)", fontSize: 12, border: "1px solid var(--line)", borderRadius: 4 }} />
                <Bar dataKey="value" fill="var(--amber)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card chart-wide">
          <div className="chart-title">Spend over time (closed work orders)</div>
          {byMonth.length === 0 ? <div className="chart-empty">No closed work orders with cost yet</div> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={byMonth} margin={{ top: 4, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} contentStyle={{ fontFamily: "var(--font-body)", fontSize: 12, border: "1px solid var(--line)", borderRadius: 4 }} />
                <Line type="monotone" dataKey="value" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkOrderForm({ units, vendors, onSave, onCancel }) {
  const [f, setF] = useState({
    unitId: units[0]?.id || "", category: CATEGORIES[0], vendorId: vendors[0]?.id || "",
    description: "", cost: "", status: "Open",
    dateOpened: new Date().toISOString().slice(0, 10), dateClosed: "", invoiceRef: ""
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="panel">
      <div className="panel-head">
        <span>New work order</span>
        <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
      </div>
      <div className="form-grid">
        <Field label="Unit">
          <select value={f.unitId} onChange={set("unitId")}>
            {units.length === 0 && <option value="">Add a unit first</option>}
            {units.map(u => <option key={u.id} value={u.id}>{u.number} — {u.type}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select value={f.category} onChange={set("category")}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Vendor">
          <select value={f.vendorId} onChange={set("vendorId")}>
            <option value="">— none —</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Cost ($)">
          <input type="number" min="0" step="0.01" value={f.cost} onChange={set("cost")} placeholder="0.00" />
        </Field>
        <Field label="Date opened">
          <input type="date" value={f.dateOpened} onChange={set("dateOpened")} />
        </Field>
        <Field label="Date closed">
          <input type="date" value={f.dateClosed} onChange={set("dateClosed")} />
        </Field>
        <Field label="Invoice / receipt ref">
          <input type="text" value={f.invoiceRef} onChange={set("invoiceRef")} placeholder="Invoice #, PO #, or note" />
        </Field>
        <Field label="Description">
          <textarea rows={2} value={f.description} onChange={set("description")} placeholder="What was done" />
        </Field>
      </div>
      <div className="panel-actions">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={!f.unitId}
          onClick={() => onSave({ ...f, id: uid(), cost: Number(f.cost) || 0 })}>
          Save work order
        </button>
      </div>
    </div>
  );
}

function WorkOrdersTab({ workOrders, units, vendors, setWorkOrders }) {
  const [showForm, setShowForm] = useState(false);
  const [filterUnit, setFilterUnit] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const unitOf = (id) => units.find(u => u.id === id);
  const vendorOf = (id) => vendors.find(v => v.id === id);

  const filtered = workOrders
    .filter(w => !filterUnit || w.unitId === filterUnit)
    .filter(w => !filterStatus || w.status === filterStatus)
    .sort((a, b) => (b.dateOpened || "").localeCompare(a.dateOpened || ""));

  const remove = (id) => setWorkOrders(workOrders.filter(w => w.id !== id));

  return (
    <div>
      <div className="toolbar">
        <div className="filters">
          <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
            <option value="">All units</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.number}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)} disabled={units.length === 0}>
          <Plus size={15} /> New work order
        </button>
      </div>

      {units.length === 0 && (
        <div className="hint"><AlertCircle size={14} /> Add a unit first — work orders attach to a unit.</div>
      )}

      {showForm && (
        <WorkOrderForm units={units} vendors={vendors}
          onCancel={() => setShowForm(false)}
          onSave={(wo) => { setWorkOrders([wo, ...workOrders]); setShowForm(false); }} />
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No work orders yet"
          body="Log repairs, PM services, and inspections here — each one attaches to a unit and rolls into the spend dashboard." />
      ) : (
        <div className="tags">
          {filtered.map(w => {
            const u = unitOf(w.unitId), v = vendorOf(w.vendorId);
            return (
              <div className="tag-card" key={w.id}>
                <div className="tag-hole" />
                <div className="tag-top">
                  <span className="tag-unit">{u ? u.number : "—"}</span>
                  <Stamp status={w.status} />
                </div>
                <div className="tag-cat">{w.category}</div>
                {w.description && <div className="tag-desc">{w.description}</div>}
                <div className="tag-meta">
                  <span>{w.dateOpened || "—"}{w.dateClosed ? ` → ${w.dateClosed}` : ""}</span>
                  {v && <span>{v.name}</span>}
                </div>
                <div className="tag-foot">
                  <span className="tag-cost">${Number(w.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  {w.invoiceRef && <span className="tag-ref">Ref: {w.invoiceRef}</span>}
                  <button className="icon-btn tag-del" onClick={() => remove(w.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UnitsTab({ units, setUnits, workOrders }) {
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ number: "", type: "Truck", vin: "" });
  const spendFor = (id) => workOrders.filter(w => w.unitId === id && w.status === "Closed")
    .reduce((s, w) => s + (Number(w.cost) || 0), 0);

  return (
    <div>
      <div className="toolbar">
        <div />
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> Add unit
        </button>
      </div>
      {showForm && (
        <div className="panel">
          <div className="panel-head"><span>New unit</span><button className="icon-btn" onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <div className="form-grid">
            <Field label="Unit number"><input value={f.number} onChange={e => setF({ ...f, number: e.target.value })} placeholder="e.g. 123" /></Field>
            <Field label="Type">
              <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
                <option>Truck</option><option>Trailer</option><option>Van</option><option>Other</option>
              </select>
            </Field>
            <Field label="VIN (optional)"><input value={f.vin} onChange={e => setF({ ...f, vin: e.target.value })} /></Field>
          </div>
          <div className="panel-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" disabled={!f.number}
              onClick={() => { setUnits([{ ...f, id: uid() }, ...units]); setF({ number: "", type: "Truck", vin: "" }); setShowForm(false); }}>
              Save unit
            </button>
          </div>
        </div>
      )}
      {units.length === 0 ? (
        <EmptyState icon={Truck} title="No units yet" body="Add trucks and trailers here so work orders and spend can attach to a specific unit." />
      ) : (
        <table className="tbl">
          <thead><tr><th>Unit #</th><th>Type</th><th>VIN</th><th>Closed spend</th><th></th></tr></thead>
          <tbody>
            {units.map(u => (
              <tr key={u.id}>
                <td className="mono">{u.number}</td>
                <td>{u.type}</td>
                <td className="mono soft">{u.vin || "—"}</td>
                <td className="mono">${spendFor(u.id).toLocaleString()}</td>
                <td><button className="icon-btn" onClick={() => setUnits(units.filter(x => x.id !== u.id))}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VendorsTab({ vendors, setVendors, workOrders }) {
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ name: "", specialty: CATEGORIES[0], contact: "" });
  const spendFor = (id) => workOrders.filter(w => w.vendorId === id && w.status === "Closed")
    .reduce((s, w) => s + (Number(w.cost) || 0), 0);

  return (
    <div>
      <div className="toolbar">
        <div />
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={15} /> Add vendor
        </button>
      </div>
      {showForm && (
        <div className="panel">
          <div className="panel-head"><span>New vendor</span><button className="icon-btn" onClick={() => setShowForm(false)}><X size={16} /></button></div>
          <div className="form-grid">
            <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Midwest Tire Co." /></Field>
            <Field label="Specialty">
              <select value={f.specialty} onChange={e => setF({ ...f, specialty: e.target.value })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Contact"><input value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} placeholder="phone or email" /></Field>
          </div>
          <div className="panel-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" disabled={!f.name}
              onClick={() => { setVendors([{ ...f, id: uid() }, ...vendors]); setF({ name: "", specialty: CATEGORIES[0], contact: "" }); setShowForm(false); }}>
              Save vendor
            </button>
          </div>
        </div>
      )}
      {vendors.length === 0 ? (
        <EmptyState icon={Building2} title="No vendors yet" body="Add the shops and suppliers you use so work orders can be attributed and vendor spend can be compared." />
      ) : (
        <table className="tbl">
          <thead><tr><th>Vendor</th><th>Specialty</th><th>Contact</th><th>Closed spend</th><th></th></tr></thead>
          <tbody>
            {vendors.map(v => (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>{v.specialty}</td>
                <td className="soft">{v.contact || "—"}</td>
                <td className="mono">${spendFor(v.id).toLocaleString()}</td>
                <td><button className="icon-btn" onClick={() => setVendors(vendors.filter(x => x.id !== v.id))}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function FleetMaintenanceApp() {
  const [units, setUnits, unitsLoading] = useStore("units");
  const [vendors, setVendors, vendorsLoading] = useStore("vendors");
  const [workOrders, setWorkOrders, woLoading] = useStore("work-orders");
  const [tab, setTab] = useState("dashboard");

  const loading = unitsLoading || vendorsLoading || woLoading;

  const seed = async () => {
    const u = [
      { id: uid(), number: "T-101", type: "Truck", vin: "1FUJA6CV88DBX1234" },
      { id: uid(), number: "T-102", type: "Truck", vin: "1FUJA6CV88DBX5678" },
      { id: uid(), number: "TR-44", type: "Trailer", vin: "" },
    ];
    const v = [
      { id: uid(), name: "Midwest Tire Co.", specialty: "Tires", contact: "312-555-0119" },
      { id: uid(), name: "Loop Diesel Repair", specialty: "Engine", contact: "loopdiesel@example.com" },
    ];
    const w = [
      { id: uid(), unitId: u[0].id, category: "PM / Oil", vendorId: v[1].id, description: "90k mile PM service", cost: 410, status: "Closed", dateOpened: "2026-06-02", dateClosed: "2026-06-02", invoiceRef: "INV-3381" },
      { id: uid(), unitId: u[0].id, category: "Tires", vendorId: v[0].id, description: "Steer tire replacement (2)", cost: 890, status: "Closed", dateOpened: "2026-06-20", dateClosed: "2026-06-21", invoiceRef: "INV-3402" },
      { id: uid(), unitId: u[1].id, category: "Brakes", vendorId: v[1].id, description: "Rear brake pads + drums", cost: 620, status: "Closed", dateOpened: "2026-07-05", dateClosed: "2026-07-06", invoiceRef: "INV-3419" },
      { id: uid(), unitId: u[1].id, category: "Engine", vendorId: v[1].id, description: "Check engine light — sensor fault", cost: 0, status: "Open", dateOpened: "2026-08-20", dateClosed: "", invoiceRef: "" },
      { id: uid(), unitId: u[2].id, category: "DOT Inspection", vendorId: "", description: "Annual DOT inspection", cost: 150, status: "Closed", dateOpened: "2026-07-15", dateClosed: "2026-07-15", invoiceRef: "INV-3440" },
    ];
    await setUnits(u); await setVendors(v); await setWorkOrders(w);
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp },
    { id: "workorders", label: "Work Orders", icon: ClipboardList },
    { id: "units", label: "Units", icon: Truck },
    { id: "vendors", label: "Vendors", icon: Building2 },
  ];

  return (
    <div className="fleet-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .fleet-app {
          --bg: #EDEEEA; --surface: #FFFFFF; --ink: #1C2126; --ink-soft: #656B63;
          --line: #D7D9D4; --amber: #E8A33D; --red: #C1432B; --green: #4C7A54; --blue: #3D6B8C;
          --font-display: 'Barlow Condensed', sans-serif;
          --font-body: 'IBM Plex Sans', sans-serif;
          --font-mono: 'IBM Plex Mono', monospace;
          background: var(--bg); color: var(--ink); font-family: var(--font-body);
          min-height: 100%; padding: 0 0 40px 0;
        }
        .fleet-app * { box-sizing: border-box; }
        .fleet-app select, .fleet-app input, .fleet-app textarea {
          font-family: var(--font-body); font-size: 13px; color: var(--ink);
          background: var(--surface); border: 1px solid var(--line); border-radius: 4px;
          padding: 7px 9px; width: 100%;
        }
        .fleet-app select:focus, .fleet-app input:focus, .fleet-app textarea:focus {
          outline: 2px solid var(--blue); outline-offset: 1px;
        }
        .header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 14px; border-bottom: 3px solid var(--ink); }
        .header-title { display: flex; align-items: center; gap: 10px; }
        .header-title h1 { font-family: var(--font-display); font-weight: 700; font-size: 26px; letter-spacing: 0.01em; margin: 0; text-transform: uppercase; }
        .header-sub { font-size: 12px; color: var(--ink-soft); margin-top: 2px; font-family: var(--font-mono); }
        .nav { display: flex; gap: 2px; padding: 0 24px; background: var(--ink); }
        .nav button {
          font-family: var(--font-display); font-weight: 600; font-size: 15px; letter-spacing: 0.03em;
          text-transform: uppercase; color: #C7CBC3; background: transparent; border: none;
          padding: 10px 16px 9px; cursor: pointer; display: flex; align-items: center; gap: 7px;
          border-bottom: 3px solid transparent;
        }
        .nav button.active { color: #fff; border-bottom-color: var(--amber); }
        .nav button:hover:not(.active) { color: #fff; }
        .content { padding: 22px 24px; max-width: 1100px; margin: 0 auto; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 10px; flex-wrap: wrap; }
        .filters { display: flex; gap: 8px; }
        .filters select { width: auto; min-width: 130px; }
        .btn-primary {
          font-family: var(--font-body); font-weight: 600; font-size: 13px; color: #fff;
          background: var(--ink); border: none; border-radius: 4px; padding: 9px 14px;
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
        }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary:hover:not(:disabled) { background: #33393f; }
        .btn-ghost {
          font-family: var(--font-body); font-weight: 500; font-size: 13px; color: var(--ink-soft);
          background: transparent; border: 1px solid var(--line); border-radius: 4px; padding: 9px 14px; cursor: pointer;
        }
        .icon-btn { background: transparent; border: none; color: var(--ink-soft); cursor: pointer; padding: 4px; display: inline-flex; }
        .icon-btn:hover { color: var(--red); }
        .hint { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-soft); margin-bottom: 12px; }
        .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 16px; margin-bottom: 18px; }
        .panel-head { display: flex; justify-content: space-between; align-items: center; font-family: var(--font-display); font-weight: 600; font-size: 16px; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 12px; }
        .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 14px; }
        .form-grid .field:has(textarea) { grid-column: 1 / -1; }
        .field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.03em; }
        .panel-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

        .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 50px 20px; color: var(--ink-soft); border: 1.5px dashed var(--line); border-radius: 8px; }
        .empty-title { font-family: var(--font-display); font-weight: 600; font-size: 18px; color: var(--ink); text-transform: uppercase; margin-top: 4px; }
        .empty-body { font-size: 13px; max-width: 360px; }
        .empty button { margin-top: 10px; }

        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        .kpi { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--amber); border-radius: 4px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
        .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; }
        .kpi-value { font-family: var(--font-mono); font-size: 24px; font-weight: 500; }
        .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .chart-wide { grid-column: 1 / -1; }
        .chart-card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px; }
        .chart-title { font-family: var(--font-display); font-weight: 600; font-size: 15px; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 8px; }
        .chart-empty { font-size: 12.5px; color: var(--ink-soft); padding: 30px 0; text-align: center; }

        .tags { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
        .tag-card { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 3px; padding: 14px 14px 12px; box-shadow: 2px 3px 0 rgba(28,33,38,0.06); }
        .tag-hole { position: absolute; top: 10px; left: 10px; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--line); background: var(--bg); }
        .tag-top { display: flex; justify-content: space-between; align-items: center; padding-left: 18px; margin-bottom: 6px; }
        .tag-unit { font-family: var(--font-mono); font-weight: 500; font-size: 15px; }
        .stamp { font-family: var(--font-display); font-weight: 700; font-size: 10.5px; letter-spacing: 0.08em; border: 1.5px solid; border-radius: 2px; padding: 2px 6px; transform: rotate(-3deg); display: inline-block; }
        .tag-cat { font-size: 12.5px; font-weight: 600; color: var(--ink); padding-left: 18px; }
        .tag-desc { font-size: 12px; color: var(--ink-soft); padding-left: 18px; margin-top: 3px; line-height: 1.4; }
        .tag-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); padding-left: 18px; margin-top: 8px; font-family: var(--font-mono); }
        .tag-foot { display: flex; align-items: center; gap: 8px; padding-left: 18px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
        .tag-cost { font-family: var(--font-mono); font-weight: 500; font-size: 15px; }
        .tag-ref { font-size: 10.5px; color: var(--ink-soft); flex: 1; }
        .tag-del { margin-left: auto; }

        .tbl { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
        .tbl th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); font-weight: 600; padding: 9px 12px; border-bottom: 1px solid var(--line); background: #F4F5F2; }
        .tbl td { padding: 9px 12px; font-size: 13px; border-bottom: 1px solid var(--line); }
        .tbl tr:last-child td { border-bottom: none; }
        .mono { font-family: var(--font-mono); }
        .soft { color: var(--ink-soft); }
        .loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 60px 0; color: var(--ink-soft); }
      `}</style>

      <div className="header">
        <div className="header-title">
          <Wrench size={22} strokeWidth={2} />
          <div>
            <h1>Fleet Maintenance</h1>
            <div className="header-sub">Work orders · Spend tracking · Prototype v0.1</div>
          </div>
        </div>
        {units.length === 0 && workOrders.length === 0 && !loading && (
          <button className="btn-ghost" onClick={seed}>Load sample fleet data</button>
        )}
      </div>

      <div className="nav">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div className="content">
        {loading ? (
          <div className="loading"><Loader2 size={16} className="spin" /> Loading fleet data…</div>
        ) : (
          <>
            {tab === "dashboard" && <Dashboard workOrders={workOrders} units={units} vendors={vendors} />}
            {tab === "workorders" && <WorkOrdersTab workOrders={workOrders} units={units} vendors={vendors} setWorkOrders={setWorkOrders} />}
            {tab === "units" && <UnitsTab units={units} setUnits={setUnits} workOrders={workOrders} />}
            {tab === "vendors" && <VendorsTab vendors={vendors} setVendors={setVendors} workOrders={workOrders} />}
          </>
        )}
      </div>
    </div>
  );
}
