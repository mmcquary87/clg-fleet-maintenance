import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Truck, AlertTriangle, LayoutGrid } from "lucide-react";
import { CAT_COLORS } from "../lib/categories";
import { groupSum } from "../lib/groupSum";
import EmptyState from "./EmptyState";

export default function UnitView({ records }) {
  const units = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      if (!m[r.unit]) m[r.unit] = { unit: r.unit, total: 0, count: 0, categories: new Set() };
      m[r.unit].total += r.cost;
      m[r.unit].count += 1;
      m[r.unit].categories.add(r.category);
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [records]);

  const [selected, setSelected] = useState(units[0]?.unit ?? null);

  useEffect(() => {
    if (!units.find((u) => u.unit === selected)) {
      setSelected(units[0]?.unit ?? null);
    }
  }, [units, selected]);

  if (records.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No units with closed work orders yet"
        body="Once work orders are logged and closed with a cost, you'll be able to click into any unit to see its categorized spend breakdown and every line item behind it."
      />
    );
  }

  const selectedRecords = records.filter((r) => r.unit === selected);
  const selectedTotal = selectedRecords.reduce((s, r) => s + r.cost, 0);
  const selectedByCategory = groupSum(selectedRecords, "category");

  return (
    <>
      <h2>Spend by unit — click to drill in</h2>
      <div className="cards">
        {units.map((u) => (
          <button
            key={u.unit}
            className={"card" + (selected === u.unit ? " active" : "")}
            onClick={() => setSelected(u.unit)}
          >
            <div className="card-top"><Truck size={13} /><span className="card-unit">{u.unit}</span></div>
            <div className="card-total">${u.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="card-meta">
              {u.count} item{u.count > 1 ? "s" : ""} · {u.categories.size} categor{u.categories.size > 1 ? "ies" : "y"}
            </div>
          </button>
        ))}
      </div>

      {selectedRecords.length > 0 && (
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
            {selectedRecords.map((r) => (
              <div className="row" key={r.id}>
                <span className="row-cat" style={{ background: CAT_COLORS[r.category] || "#888" }}>{r.category}</span>
                <div className="row-main">
                  <div className="row-desc">
                    {r.desc}
                    {r.flag === "warranty" && <AlertTriangle size={12} className="flag" />}
                  </div>
                  <div className="row-meta">{r.date ?? "—"} · Ref {r.ref ?? "—"}</div>
                </div>
                <div className="row-cost">${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
