import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { CAT_COLORS } from "../lib/categories";
import { groupSum } from "../lib/groupSum";
import EmptyState from "./EmptyState";
import { useMilesDriven } from "../hooks/useMilesDriven";

export default function CompanyView({ records, range }) {
  const grandTotal = records.reduce((s, r) => s + r.cost, 0);
  const units = useMemo(() => new Set(records.map((r) => r.unit)), [records]);
  const byCategory = useMemo(() => groupSum(records, "category"), [records]);
  const byVendor = useMemo(() => groupSum(records, "vendor"), [records]);
  const { miles, loading: milesLoading, error: milesError } = useMilesDriven(range);

  if (records.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No closed work orders yet"
        body="Once work orders are logged and closed with a cost, company-wide spend by category and vendor will show up here."
      />
    );
  }

  return (
    <>
      <h2>Fleet maintenance spend — company-wide</h2>

      <div className="stats">
        <div className="stat" style={{ borderLeftColor: "var(--red)" }}>
          <span className="stat-label">Total spend</span>
          <span className="stat-value">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Invoices</span>
          <span className="stat-value">{records.length}</span>
        </div>
        <div className="stat" style={{ borderLeftColor: "var(--blue)" }}>
          <span className="stat-label">Units affected</span>
          <span className="stat-value">{units.size}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg / unit</span>
          <span className="stat-value">${(grandTotal / units.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        {range?.start && range?.end && (
          <div className="stat" style={{ borderLeftColor: "var(--amber)" }}>
            <span className="stat-label">Cost / mile</span>
            <span className="stat-value">
              {milesLoading ? "…" : milesError || !miles ? "—" : `$${(grandTotal / miles).toFixed(2)}`}
            </span>
            {!milesLoading && !milesError && miles > 0 && (
              <span style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{miles.toLocaleString()} mi driven</span>
            )}
            {milesError && <span style={{ fontSize: 10.5, color: "var(--red)" }}>{milesError}</span>}
          </div>
        )}
      </div>

      <div className="charts">
        <div className="chart-card">
          <div className="chart-title">Spend by category</div>
          <ResponsiveContainer width="100%" height={210}>
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
          <div className="chart-title">Spend by vendor</div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={byVendor} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
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
  );
}
