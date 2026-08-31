import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { LayoutGrid } from "lucide-react";
import { CATEGORIES, CAT_COLORS } from "../lib/categories";
import { groupSum } from "../lib/groupSum";
import EmptyState from "./EmptyState";

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString();
}
function fmtMoney2(n) {
  return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
}

function unitTotals(records) {
  const m = {};
  records.forEach((r) => {
    if (!m[r.unit]) m[r.unit] = { unit: r.unit, total: 0, count: 0, categories: new Set() };
    m[r.unit].total += r.cost;
    m[r.unit].count += 1;
    m[r.unit].categories.add(r.category);
  });
  return Object.values(m);
}

function LeaderboardRow({ rank, label, sub, value, max, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "8px", width: "100%",
        background: active ? "var(--clg-reflection)" : "transparent", border: "none",
        borderRadius: "var(--clg-radius-sm)", cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: "50%", background: color || "var(--clg-navy)", color: "#fff",
        fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 10.5, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-heading)" }}>Unit {label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--clg-navy)", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(value)}</div>
        {max != null && (
          <div style={{ width: 70, background: "var(--clg-smoke)", borderRadius: "var(--clg-radius-pill)", height: 5, marginTop: 4, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color || "var(--clg-royal)", height: "100%" }} />
          </div>
        )}
      </div>
    </button>
  );
}

function SectionCard({ children, style }) {
  return (
    <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", padding: 20, boxShadow: "var(--clg-shadow-resting)", ...style }}>
      {children}
    </div>
  );
}

export default function UnitView({ records }) {
  const units = useMemo(() => unitTotals(records).sort((a, b) => b.total - a.total), [records]);
  const [ownershipSort, setOwnershipSort] = useState("highest");
  const [selected, setSelected] = useState(null);

  const ownershipUnits = useMemo(() => {
    return [...units]
      .sort((a, b) => (ownershipSort === "highest" ? b.total - a.total : a.total - b.total))
      .slice(0, 10);
  }, [units, ownershipSort]);
  const ownershipMax = Math.max(...ownershipUnits.map((u) => u.total), 1);

  const categoryLeaderboards = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const byUnit = {};
      records.filter((r) => r.category === cat).forEach((r) => {
        byUnit[r.unit] = (byUnit[r.unit] || 0) + r.cost;
      });
      const top = Object.entries(byUnit)
        .map(([unit, total]) => ({ unit, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      return top.length > 0 ? { category: cat, top, max: top[0].total } : null;
    }).filter(Boolean);
  }, [records]);

  useEffect(() => {
    if (selected && !units.find((u) => u.unit === selected)) setSelected(units[0]?.unit ?? null);
    if (!selected && units.length > 0) setSelected(units[0].unit);
  }, [units, selected]);

  if (records.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No units with closed work orders yet"
        body="Once work orders are logged and closed with a cost, you'll see spend leaderboards by unit and by category here."
      />
    );
  }

  const selectedUnit = units.find((u) => u.unit === selected);
  const selectedRecords = records.filter((r) => r.unit === selected);
  const selectedTotal = selectedRecords.reduce((s, r) => s + r.cost, 0);
  const selectedByCategory = groupSum(selectedRecords, "category");

  return (
    <>
      <SectionCard style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>
            Cost of ownership
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {["highest", "lowest"].map((s) => (
              <button
                key={s}
                onClick={() => setOwnershipSort(s)}
                style={{
                  padding: "6px 13px", fontSize: 11.5, fontWeight: 600, textTransform: "capitalize", cursor: "pointer",
                  border: "1px solid " + (ownershipSort === s ? "var(--clg-royal)" : "var(--clg-border-default)"),
                  background: ownershipSort === s ? "var(--clg-royal)" : "#fff",
                  color: ownershipSort === s ? "#fff" : "var(--clg-text-muted)",
                  borderRadius: "var(--clg-radius-pill)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 8 }}>
          Top 10 units by total maintenance spend, {ownershipSort === "highest" ? "most expensive" : "least expensive"} first.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 2 }}>
          {ownershipUnits.map((u, i) => (
            <LeaderboardRow
              key={u.unit}
              rank={i + 1}
              label={u.unit}
              sub={`${u.count} item${u.count > 1 ? "s" : ""} · ${u.categories.size} categor${u.categories.size > 1 ? "ies" : "y"}`}
              value={u.total}
              max={ownershipMax}
              color={ownershipSort === "highest" ? "var(--clg-scarlet)" : "var(--clg-royal)"}
              active={selected === u.unit}
              onClick={() => setSelected(u.unit)}
            />
          ))}
        </div>
      </SectionCard>

      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", marginBottom: 12 }}>
        Top units by category
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, marginBottom: 22 }}>
        {categoryLeaderboards.map(({ category, top, max }) => (
          <SectionCard key={category} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: CAT_COLORS[category] || "#888", flexShrink: 0 }} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--clg-text-heading)" }}>{category}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {top.map((u, i) => (
                <LeaderboardRow
                  key={u.unit}
                  rank={i + 1}
                  label={u.unit}
                  value={u.total}
                  max={max}
                  color={CAT_COLORS[category] || "#888"}
                  active={selected === u.unit}
                  onClick={() => setSelected(u.unit)}
                />
              ))}
            </div>
          </SectionCard>
        ))}
      </div>

      {selectedUnit && (
        <SectionCard style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)" }}>Unit {selectedUnit.unit}</div>
              <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 2 }}>{selectedRecords[0]?.vendor}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)" }}>{fmtMoney2(selectedTotal)}</div>
              <div style={{ fontSize: 11, color: "var(--clg-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total spend</div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 8 }}>
            Categorized breakdown
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, selectedByCategory.length * 42)}>
            <BarChart data={selectedByCategory} layout="vertical" margin={{ top: 0, right: 40, left: 4, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--clg-border-subtle)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--clg-text-muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--clg-text-body)" }} width={90} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, formatter: (v) => fmtMoney(Number(v)) }}>
                {selectedByCategory.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name] || "#888"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {selectedRecords.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
                <span style={{ flexShrink: 0, background: CAT_COLORS[r.category] || "#888", color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: "var(--clg-radius-pill)" }}>
                  {r.category}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--clg-text-body)" }}>{r.desc || "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 2 }}>{r.date ?? "—"} · Ref {r.ref ?? "—"}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-navy)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney2(r.cost)}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  );
}
