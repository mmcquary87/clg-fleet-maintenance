import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { CAT_COLORS } from "../lib/categories";
import { groupSum, groupVendorStats } from "../lib/groupSum";
import EmptyState from "./EmptyState";
import { useMilesDriven } from "../hooks/useMilesDriven";

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString();
}
function fmtPct(n) {
  return n.toFixed(1) + "%";
}

// A KPI card the redesign calls for (PM Compliance, Downtime Cost) but this
// schema can't compute honestly yet -- no PM-interval schedule and no
// downtime-cost rate exist anywhere in the data model. Shown as Pending
// rather than a fabricated number, matching how the Operations Dashboard
// treats every other not-yet-computable KPI.
function PendingCard({ label, reason }) {
  return (
    <div style={{
      background: "#fff", borderTop: "4px solid var(--clg-moon)", borderRadius: "var(--clg-radius-md)",
      padding: 20, boxShadow: "var(--clg-shadow-resting)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>{label}</div>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", background: "var(--clg-surface-subtle)", padding: "2px 8px", borderRadius: "var(--clg-radius-pill)" }}>Pending</div>
      </div>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 30, color: "var(--clg-border-strong)", marginTop: 10 }}>—</div>
      <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>{reason}</div>
    </div>
  );
}

export default function CompanyView({ records, range }) {
  const grandTotal = records.reduce((s, r) => s + r.cost, 0);
  const byCategory = useMemo(() => groupSum(records, "category"), [records]);
  const byVendor = useMemo(() => groupVendorStats(records), [records]);
  const { miles, loading: milesLoading, error: milesError } = useMilesDriven(range);

  // Tractors/Trailers split -- real, from units.type (Truck/Trailer), not a
  // blended average across two assets with very different cost profiles.
  const truckRecords = useMemo(() => records.filter((r) => r.unitType === "Truck"), [records]);
  const trailerRecords = useMemo(() => records.filter((r) => r.unitType === "Trailer"), [records]);
  const truckTotal = truckRecords.reduce((s, r) => s + r.cost, 0);
  const trailerTotal = trailerRecords.reduce((s, r) => s + r.cost, 0);
  const truckUnits = new Set(truckRecords.map((r) => r.unit)).size;
  const costPerTruck = truckUnits > 0 ? truckTotal / truckUnits : null;

  // Unscheduled Repair % -- a category-based proxy (everything that isn't
  // "PM / Oil" counts as unscheduled), since there's no explicit
  // scheduled/reactive flag on a work order. Stated as a proxy, not hidden.
  const pmTotal = records.filter((r) => r.category === "PM / Oil").reduce((s, r) => s + r.cost, 0);
  const unscheduledPct = grandTotal > 0 ? ((grandTotal - pmTotal) / grandTotal) * 100 : null;
  const truckPmTotal = truckRecords.filter((r) => r.category === "PM / Oil").reduce((s, r) => s + r.cost, 0);
  const trailerPmTotal = trailerRecords.filter((r) => r.category === "PM / Oil").reduce((s, r) => s + r.cost, 0);
  const truckUnscheduledPct = truckTotal > 0 ? ((truckTotal - truckPmTotal) / truckTotal) * 100 : null;
  const trailerUnscheduledPct = trailerTotal > 0 ? ((trailerTotal - trailerPmTotal) / trailerTotal) * 100 : null;

  if (records.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No closed work orders yet"
        body="Once work orders are logged and closed with a cost, company-wide spend by category and vendor will show up here."
      />
    );
  }

  const maxCat = byCategory[0]?.value || 1;
  const maxVendor = byVendor[0]?.spend || 1;

  return (
    <>
      {/* Hero: gradient headline band */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--clg-radius-md)", background: "var(--clg-gradient-brand)", padding: "36px 40px", marginBottom: 16 }}>
        <svg style={{ position: "absolute", right: -34, bottom: -46 }} width="260" height="260" viewBox="0 0 129.9 123.6" opacity="0.10">
          <g transform="translate(-144 -114.1)">
            <path fill="#fff" d="M273.9 161.3 L144 161.3 L184.1 190.5 L168.8 237.7 Z" />
            <path fill="#fff" d="M273.9 161.3 L144 161.3 L190.4 188.5 Z" />
            <path fill="#fff" d="M222.3 155.1 L209 114.1 L195.6 155.1 Z M214.2 212.4 L249.1 237.7 L235.8 196.6 Z" />
          </g>
        </svg>
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 44, flexWrap: "wrap" }}>
          <div style={{ flex: 1.4, minWidth: 260 }}>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>
              Fleet Maintenance · Company-Wide
            </div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 800, fontSize: 52, lineHeight: 1, color: "#fff", fontVariantNumeric: "tabular-nums", marginTop: 10 }}>
              {fmtMoney(grandTotal)}
            </div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(255,255,255,0.88)", marginTop: 6 }}>
              Maintenance Spend
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
              Tractors {fmtMoney(truckTotal)} · Trailers {fmtMoney(trailerTotal)}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.22)" }} />
          <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 28, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                {costPerTruck != null ? fmtMoney(costPerTruck) : "—"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>Cost / Truck</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
                {truckUnits} tractor{truckUnits === 1 ? "" : "s"} with spend this period
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 28, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                {milesLoading ? "…" : milesError || !miles ? "—" : `$${(grandTotal / miles).toFixed(2)}`}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>Cost / Mile</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
                {milesError ? milesError : miles ? `${miles.toLocaleString()} mi driven (fleet-wide)` : "Pick a date range to compute"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status strip -- only what's honestly computable from real data */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
        <div style={{ background: "#FCEBEB", borderTop: "4px solid var(--clg-scarlet)", borderRadius: "var(--clg-radius-md)", padding: 20, boxShadow: "var(--clg-shadow-resting)" }}>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-brand)" }}>Unscheduled Repair %</div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 30, lineHeight: 1.1, color: "var(--clg-navy)", marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
            {unscheduledPct != null ? fmtPct(unscheduledPct) : "—"}
          </div>
          <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 8 }}>
            {truckUnscheduledPct != null ? `Tractors ${fmtPct(truckUnscheduledPct)}` : "Tractors —"}
            {" · "}
            {trailerUnscheduledPct != null ? `Trailers ${fmtPct(trailerUnscheduledPct)}` : "Trailers —"}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", marginTop: 8, lineHeight: 1.5 }}>
            Proxy: everything outside "PM / Oil" counts as unscheduled — there's no explicit scheduled/reactive flag on a work order yet.
          </div>
        </div>
        <PendingCard label="PM Compliance" reason='Needs a PM interval schedule (due date/mileage per unit) — nothing tracks that yet.' />
        <PendingCard label="Downtime Cost" reason="Needs an agreed $/day downtime rate — shop days are trackable, a dollar cost for them isn't defined." />
      </div>

      {/* Spend by category: ranked leaderboard */}
      <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", padding: 22, boxShadow: "var(--clg-shadow-resting)", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>Spend by category</div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{byCategory.length} categories, ranked by spend</div>
        </div>
        {byCategory.map((c, i) => {
          const color = CAT_COLORS[c.name] || "#888";
          return (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: color, color: "#fff", fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ width: 130, flexShrink: 0, fontSize: 12.5, fontWeight: 500, color: "var(--clg-text-heading)" }}>{c.name}</div>
              <div style={{ flex: 1, background: "var(--clg-smoke)", borderRadius: "var(--clg-radius-pill)", height: i === 0 ? 26 : 20, overflow: "hidden" }}>
                <div style={{ width: `${(c.value / maxCat) * 100}%`, background: color, height: "100%", borderRadius: "var(--clg-radius-pill)" }} />
              </div>
              <div style={{ width: 100, flexShrink: 0, textAlign: "right", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--clg-text-heading)" }}>
                {fmtMoney(c.value)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Spend by vendor: ranked leaderboard */}
      <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", padding: 22, boxShadow: "var(--clg-shadow-resting)" }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", marginBottom: 8 }}>Spend by vendor</div>
        {byVendor.map((v, i) => (
          <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--clg-navy)", color: "#fff", fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1.4, minWidth: 160 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--clg-text-heading)" }}>{v.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>
                {v.jobs} job{v.jobs === 1 ? "" : "s"} · {fmtMoney(v.avgTicket)} avg ticket · {v.units} unit{v.units === 1 ? "" : "s"}
              </div>
            </div>
            <div style={{ flex: 1.2, minWidth: 120 }}>
              <div style={{ background: "var(--clg-smoke)", borderRadius: "var(--clg-radius-pill)", height: 8, overflow: "hidden" }}>
                <div style={{ width: `${(v.spend / maxVendor) * 100}%`, background: "linear-gradient(90deg, var(--clg-royal), var(--clg-navy))", height: "100%", borderRadius: "var(--clg-radius-pill)" }} />
              </div>
            </div>
            <div style={{ width: 100, flexShrink: 0, textAlign: "right", fontSize: 14, fontWeight: 700, color: "var(--clg-navy)", fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(v.spend)}
            </div>
            <div style={{ width: 66, flexShrink: 0, textAlign: "right" }}>
              <span style={{ display: "inline-block", background: "var(--clg-reflection)", color: "var(--clg-royal)", fontFamily: "var(--clg-font-heading)", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: "var(--clg-radius-pill)" }}>
                {fmtPct(v.pctFleet)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
