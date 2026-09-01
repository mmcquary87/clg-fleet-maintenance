import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { LayoutGrid, Search } from "lucide-react";
import { Input } from "../ds";
import { CATEGORIES, CAT_COLORS } from "../lib/categories";
import { groupSum } from "../lib/groupSum";
import { useMilesDriven } from "../hooks/useMilesDriven";
import EmptyState from "./EmptyState";

// Below this, a unit's odometer/GPS delta for the period is too thin to
// trust as a cost/mile ratio -- a truck that sat in the shop most of the
// window can otherwise look like a wild per-mile outlier purely because
// the denominator is tiny, not because it's actually expensive to run.
const MIN_MILES_FOR_RATIO = 500;

const UNIT_TYPES = ["All", "Truck", "Trailer"];
// Higher than the Company Spend page's fleet-wide 15% bar -- a single
// unit's category mix is noisier, so it takes more to be worth a callout.
const UNCATEGORIZED_FLAG_THRESHOLD_PCT = 40;

// A unit number that isn't a short, mostly-numeric code (optionally with a
// single letter prefix, e.g. "D3429") is worth a second look -- work orders
// created via "Log Invoice" auto-create a unit for whatever's typed into
// the unit-number field (see findOrCreateUnit in NewWorkOrderForm), so a
// mistyped invoice/PO reference can end up filed as its own "unit." This is
// a simple heuristic against this fleet's actual numbering, not a hard rule.
function looksLikeUnitNumber(unit) {
  return /^[A-Za-z]?\d{3,5}$/.test((unit || "").trim());
}

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString();
}
function fmtMoney2(n) {
  return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 });
}
function fmtPerMile(n) {
  return "$" + n.toFixed(2);
}

function unitTotals(records) {
  const m = {};
  records.forEach((r) => {
    if (!m[r.unit]) m[r.unit] = { unit: r.unit, unitType: r.unitType, total: 0, count: 0, categories: new Set() };
    m[r.unit].total += r.cost;
    m[r.unit].count += 1;
    m[r.unit].categories.add(r.category);
  });
  return Object.values(m);
}

function LeaderboardRow({ rank, label, sub, value, max, color, active, onClick, format = fmtMoney }) {
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
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--clg-navy)", fontVariantNumeric: "tabular-nums" }}>{format(value)}</div>
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

export default function UnitView({ records, range }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [ownershipSort, setOwnershipSort] = useState("highest");
  const [selected, setSelected] = useState(null);
  const {
    perUnit: milesPerUnit, matchedButNoDataCount, matchedButNoDataSample,
    unmatchedTruckCount, unmatchedTruckSample,
    loading: milesLoading, error: milesError,
  } = useMilesDriven(range);

  const filteredRecords = useMemo(
    () => records.filter((r) => typeFilter === "All" || r.unitType === typeFilter),
    [records, typeFilter],
  );
  const units = useMemo(() => unitTotals(filteredRecords).sort((a, b) => b.total - a.total), [filteredRecords]);

  const ownershipUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? units.filter((u) => u.unit.toLowerCase().includes(q)) : units;
    return [...matched]
      .sort((a, b) => (ownershipSort === "highest" ? b.total - a.total : a.total - b.total))
      .slice(0, q ? 25 : 10);
  }, [units, ownershipSort, query]);
  const ownershipMax = Math.max(...ownershipUnits.map((u) => u.total), 1);

  // Cost/mile per unit -- trucks only (trailers have no engine/fuel system,
  // so samsara-miles never reports mileage for them at all -- not a data
  // gap, just not applicable), and only above MIN_MILES_FOR_RATIO this
  // period; everything else is excluded from the ranking rather than shown
  // as a misleadingly huge or tiny ratio.
  const milesByUnitNumber = useMemo(
    () => new Map(milesPerUnit.map((u) => [u.unitNumber, u.miles])),
    [milesPerUnit],
  );
  const truckUnits = useMemo(() => units.filter((u) => u.unitType === "Truck"), [units]);
  const costPerMileUnits = useMemo(() => {
    return truckUnits
      .map((u) => {
        const miles = milesByUnitNumber.get(u.unit);
        if (miles == null || miles < MIN_MILES_FOR_RATIO) return null;
        return { ...u, miles, perMile: u.total / miles };
      })
      .filter(Boolean)
      .sort((a, b) => b.perMile - a.perMile);
  }, [truckUnits, milesByUnitNumber]);
  const excludedFromRatio = truckUnits.length - costPerMileUnits.length;
  const fleetAvgPerMile = costPerMileUnits.length > 0
    ? costPerMileUnits.reduce((s, u) => s + u.total, 0) / costPerMileUnits.reduce((s, u) => s + u.miles, 0)
    : null;
  const costPerMileMax = Math.max(...costPerMileUnits.map((u) => u.perMile), 0.01);

  const categoryLeaderboards = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const byUnit = {};
      filteredRecords.filter((r) => r.category === cat).forEach((r) => {
        byUnit[r.unit] = (byUnit[r.unit] || 0) + r.cost;
      });
      const top = Object.entries(byUnit)
        .map(([unit, total]) => ({ unit, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      return top.length > 0 ? { category: cat, top, max: top[0].total } : null;
    }).filter(Boolean);
  }, [filteredRecords]);

  // Top 10 units' share of total fleet spend -- always against the highest
  // spenders regardless of which sort direction is currently toggled, since
  // the point is concentration ("how much rides on your worst units"), not
  // whichever list is on screen.
  const grandTotal = units.reduce((s, u) => s + u.total, 0);
  const top10ByHighest = [...units].sort((a, b) => b.total - a.total).slice(0, 10);
  const top10Total = top10ByHighest.reduce((s, u) => s + u.total, 0);
  const top10SharePct = grandTotal > 0 ? (top10Total / grandTotal) * 100 : 0;

  const suspiciousUnitIds = useMemo(
    () => units.filter((u) => !looksLikeUnitNumber(u.unit)).map((u) => u.unit),
    [units],
  );

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

  // "What stands out" -- flagged only above a real threshold, so a unit
  // with a stray Other item or two doesn't get an alarming callout.
  const selectedOtherTotal = selectedRecords.filter((r) => r.category === "Other").reduce((s, r) => s + r.cost, 0);
  const selectedOtherPct = selectedTotal > 0 ? (selectedOtherTotal / selectedTotal) * 100 : 0;
  const selectedOtherCount = selectedRecords.filter((r) => r.category === "Other").length;

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--clg-text-muted)" }} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search unit number…" style={{ paddingLeft: 30 }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {UNIT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "6px 13px", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                border: "1px solid " + (typeFilter === t ? "var(--clg-royal)" : "var(--clg-border-default)"),
                background: typeFilter === t ? "var(--clg-royal)" : "#fff",
                color: typeFilter === t ? "#fff" : "var(--clg-text-muted)",
                borderRadius: "var(--clg-radius-pill)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

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
        {!query.trim() && top10ByHighest.length > 1 && (
          <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginBottom: 8, lineHeight: 1.5 }}>
            These {top10ByHighest.length} units carry <strong style={{ color: "var(--clg-navy)" }}>{fmtMoney(top10Total)}</strong> — {top10SharePct.toFixed(0)}% of {fmtMoney(grandTotal)} in fleet spend, from {top10ByHighest.length} of {units.length} units.
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 8 }}>
          {query.trim()
            ? `${ownershipUnits.length} unit${ownershipUnits.length === 1 ? "" : "s"} matching "${query.trim()}", ${ownershipSort === "highest" ? "most expensive" : "least expensive"} first.`
            : `Top 10 units by total maintenance spend, ${ownershipSort === "highest" ? "most expensive" : "least expensive"} first.`}
        </div>
        {ownershipUnits.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", padding: "10px 8px" }}>No units match.</div>
        ) : (
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
        )}
      </SectionCard>

      {range?.start && (
        <SectionCard style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", marginBottom: 4 }}>
            Cost per mile
          </div>
          {milesLoading ? (
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", padding: "10px 0" }}>Loading mileage…</div>
          ) : milesError ? (
            <div style={{ fontSize: 12.5, color: "var(--clg-scarlet)", padding: "10px 0" }}>{milesError}</div>
          ) : costPerMileUnits.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", padding: "10px 0" }}>
              No truck has at least {MIN_MILES_FOR_RATIO} mi of Samsara-matched mileage in this range yet.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginBottom: 8, lineHeight: 1.5 }}>
                Fleet-wide average is <strong style={{ color: "var(--clg-navy)" }}>{fmtPerMile(fleetAvgPerMile)}/mi</strong> across {costPerMileUnits.length} truck{costPerMileUnits.length === 1 ? "" : "s"} with enough mileage data — highest is Unit {costPerMileUnits[0].unit} at {fmtPerMile(costPerMileUnits[0].perMile)}/mi.
              </div>
              <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 8 }}>
                Ranked highest cost/mile first. Trailers don't accrue their own mileage, so this is trucks only.{" "}
                {excludedFromRatio > 0 && `${excludedFromRatio} truck${excludedFromRatio === 1 ? "" : "s"} excluded — under ${MIN_MILES_FOR_RATIO} mi or no Samsara match this period, too little data for a reliable ratio.`}
              </div>
              {matchedButNoDataCount > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginBottom: 8, lineHeight: 1.5 }}>
                  {matchedButNoDataCount} unit{matchedButNoDataCount === 1 ? "" : "s"} matched to a Samsara vehicle returned zero mileage data for this range at all (not just under {MIN_MILES_FOR_RATIO} mi) — worth checking Samsara's own report directly for these, since a truck matched to Samsara silently missing from its report isn't expected: {matchedButNoDataSample.slice(0, 8).join(", ")}{matchedButNoDataCount > 8 ? ", …" : ""}.
                </div>
              )}
              {unmatchedTruckCount > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginBottom: 8, lineHeight: 1.5 }}>
                  {unmatchedTruckCount} active truck{unmatchedTruckCount === 1 ? "" : "s"} {unmatchedTruckCount === 1 ? "has" : "have"} no Samsara vehicle linked at all, so {unmatchedTruckCount === 1 ? "it never counts" : "they never count"} toward miles driven for any period — this is a gap in this app's own unit-to-Samsara matching, not something Samsara's API is doing: {unmatchedTruckSample.slice(0, 8).join(", ")}{unmatchedTruckCount > 8 ? ", …" : ""}.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 2 }}>
                {costPerMileUnits.slice(0, 10).map((u, i) => (
                  <LeaderboardRow
                    key={u.unit}
                    rank={i + 1}
                    label={u.unit}
                    sub={`${fmtMoney(u.total)} over ${u.miles.toLocaleString()} mi`}
                    value={u.perMile}
                    max={costPerMileMax}
                    format={fmtPerMile}
                    color="var(--clg-scarlet)"
                    active={selected === u.unit}
                    onClick={() => setSelected(u.unit)}
                  />
                ))}
              </div>
            </>
          )}
        </SectionCard>
      )}

      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", marginBottom: 4 }}>
        Top units by category
      </div>
      <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 14 }}>
        Ordered by category total, largest first. Uncategorized spend is highlighted in red — it's the one category you can act on today.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, marginBottom: 14 }}>
        {categoryLeaderboards.map(({ category, top, max }) => {
          const isOther = category === "Other";
          const color = isOther ? "var(--clg-scarlet)" : (CAT_COLORS[category] || "#888");
          return (
            <SectionCard key={category} style={isOther ? { padding: 16, borderTop: "3px solid var(--clg-scarlet)" } : { padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: isOther ? "var(--clg-scarlet)" : "var(--clg-text-heading)" }}>{category}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {top.map((u, i) => (
                  <LeaderboardRow
                    key={u.unit}
                    rank={i + 1}
                    label={u.unit}
                    value={u.total}
                    max={max}
                    color={color}
                    active={selected === u.unit}
                    onClick={() => setSelected(u.unit)}
                  />
                ))}
              </div>
            </SectionCard>
          );
        })}
      </div>

      {suspiciousUnitIds.length > 0 && (
        <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", borderTop: "3px solid var(--clg-mercury)", padding: "14px 18px", marginBottom: 22, fontSize: 12.5, color: "var(--clg-text-body)", lineHeight: 1.6 }}>
          {suspiciousUnitIds.length} unit ID{suspiciousUnitIds.length === 1 ? "" : "s"} above — {suspiciousUnitIds.join(", ")} — {suspiciousUnitIds.length === 1 ? "doesn't" : "don't"} match a typical unit-number format and may be a misentered invoice or PO reference. Worth confirming before trusting rankings that include {suspiciousUnitIds.length === 1 ? "it" : "them"}.
        </div>
      )}

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

          {selectedOtherPct > UNCATEGORIZED_FLAG_THRESHOLD_PCT && (
            <div style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: "12px 14px", marginBottom: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-scarlet)" }}>What stands out</div>
              <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginTop: 6, lineHeight: 1.55 }}>
                {selectedOtherPct.toFixed(0)}% of this unit's spend has no category on it — {fmtMoney(selectedOtherTotal)} across {selectedOtherCount} item{selectedOtherCount === 1 ? "" : "s"}.
              </div>
            </div>
          )}

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
