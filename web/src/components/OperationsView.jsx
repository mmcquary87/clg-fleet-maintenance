import { useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { Card, Badge, Eyebrow } from "../ds";
import { MODULES, KPIS } from "../lib/opsKpis";
import { useFleetMpg } from "../hooks/useFleetMpg";
import { useAlvysTripsReport } from "../hooks/useAlvysTripsReport";
import { thisMonthRange } from "../lib/dateRangePresets";
import DateRangeFilter from "./DateRangeFilter";

function formatLiveValue(kpi, value) {
  if (kpi.unit === "$") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kpi.unit === "mi") return `${Math.round(value).toLocaleString()} mi`;
  if (kpi.unit === "hrs") return `${value.toFixed(1)} hrs`;
  return `${value.toFixed(kpi.unit === "%" ? 1 : 2)} ${kpi.unit}`;
}

const STATUS_COLOR = {
  green: "#2E9E5B",
  yellow: "#E8C13D",
  red: "var(--clg-scarlet)",
  pending: "var(--clg-cool)",
};

function statusFor(kpi, value) {
  // Only Empty Mile % has a truly active threshold today; everything else
  // is Pending per the framework's own governance rules, real data or not.
  if (kpi.threshold.status !== "active" || value == null) return "pending";
  if (kpi.no === 7) {
    if (value < 10.0) return "green";
    if (value < 15.0) return "yellow";
    return "red";
  }
  return "pending";
}

function KpiCard({ kpi, liveValue, liveLoading, liveError, hasRange, breakdown, secondaryStat }) {
  const [open, setOpen] = useState(false);
  const hasLive = kpi.dataStatus === "live";
  const status = hasLive ? statusFor(kpi, liveValue) : "pending";
  const color = STATUS_COLOR[status];

  return (
    <Card padding={16} style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.06em" }}>
            KPI {kpi.no} · {kpi.type.toUpperCase()}
          </div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 14.5, marginTop: 2 }}>{kpi.name}</div>
        </div>
        <Badge tone={status === "pending" ? "neutral" : "outline"} style={status !== "pending" ? { background: color, color: "#fff", border: "none" } : {}}>
          {status === "pending" ? "Pending" : status}
        </Badge>
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {!hasLive ? (
          <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>{kpi.blockedReason}</span>
        ) : liveLoading ? (
          <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 22, color: "var(--clg-text-muted)" }}>…</span>
        ) : liveError ? (
          <span style={{ fontSize: 12, color: "var(--clg-scarlet)" }}>{liveError}</span>
        ) : liveValue == null ? (
          <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
            {hasRange ? "No data for this range" : "Select a date range"}
          </span>
        ) : (
          <>
            <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 22, fontWeight: 700, color: "var(--clg-navy)" }}>
              {formatLiveValue(kpi, liveValue)}
            </span>
            {secondaryStat?.value != null && (
              <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
                · {secondaryStat.label}{" "}
                <span style={{ fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-body)", fontWeight: 600 }}>
                  {formatLiveValue({ unit: secondaryStat.unit }, secondaryStat.value)}
                </span>
              </span>
            )}
          </>
        )}
      </div>

      {breakdown && breakdown.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--clg-border-subtle)" }}>
          <div style={{ fontSize: 9.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>
            BY FLEET
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {breakdown.map((b) => (
              <div key={b.fleetName} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--clg-text-body)" }}>{b.fleetName}</span>
                <span style={{ fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-navy)" }}>
                  {b.revenueMilesPerActiveDriverPerWeek.toLocaleString()} mi
                  <span style={{ color: "var(--clg-text-muted)", fontFamily: "var(--clg-font-body)" }}> ({b.activeDrivers} drivers)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          marginTop: 10, background: "none", border: "none", cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--clg-royal)",
        }}
      >
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        Formula &amp; thresholds
      </button>
      {open && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--clg-text-muted)", lineHeight: 1.5 }}>
          <div><strong>Formula:</strong> {kpi.formula}</div>
          <div style={{ marginTop: 4 }}>
            <strong>Thresholds:</strong> Green {kpi.threshold.green} · Yellow {kpi.threshold.yellow} · Red {kpi.threshold.red}
            {kpi.threshold.status !== "active" && " (not yet approved by CLG — display only)"}
          </div>
          <div style={{ marginTop: 4 }}>{kpi.classification}</div>
        </div>
      )}
    </Card>
  );
}

export default function OperationsView() {
  // Defaults to "This month" (not "All time") — Alvys's trips/search
  // always needs a bounded date range, so an unbounded default would
  // silently return nothing on first load instead of real numbers.
  const [range, setRange] = useState(thisMonthRange());
  const { data: mpgData, loading: mpgLoading, error: mpgError } = useFleetMpg(range);
  const { data: tripsData, loading: tripsLoading, error: tripsError } = useAlvysTripsReport(range);

  const LIVE = {
    6: { value: tripsData?.revenuePerActiveTractorPerWeek ?? null, loading: tripsLoading, error: tripsError },
    7: { value: tripsData?.emptyMilePct ?? null, loading: tripsLoading, error: tripsError },
    8: { value: mpgData?.fleetMpg ?? null, loading: mpgLoading, error: mpgError },
    9: { value: tripsData?.onTimePickupPct ?? null, loading: tripsLoading, error: tripsError },
    12: { value: tripsData?.revenueMilesPerActiveDriverPerWeek ?? null, loading: tripsLoading, error: tripsError },
    15: { value: tripsData?.onTimeDeliveryPct ?? null, loading: tripsLoading, error: tripsError },
    16: { value: tripsData?.waitingDetentionHoursPerActiveDriverPerWeek ?? null, loading: tripsLoading, error: tripsError },
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <Eyebrow tone="brand">Operations Dashboard</Eyebrow>
        <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Gauge size={20} /> 17 Primary Weekly KPIs
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 720 }}>
          Per the CLG Operations Dashboard Framework v1.0. Values show real data where a source is connected;
          everything else is marked Pending until CLG approves the methodology or connects the data —
          no number here is fabricated.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <DateRangeFilter onChange={setRange} disableAllTime />
      </div>

      {MODULES.map((mod) => (
        <div key={mod.id} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 16, color: "var(--clg-navy)" }}>{mod.name}</div>
            <div style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>{mod.tagline}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {KPIS.filter((k) => k.module === mod.id).map((kpi) => (
              <KpiCard
                key={kpi.no}
                kpi={kpi}
                liveValue={LIVE[kpi.no]?.value ?? null}
                liveLoading={LIVE[kpi.no]?.loading ?? false}
                liveError={LIVE[kpi.no]?.error ?? null}
                hasRange={!!(range?.start && range?.end)}
                breakdown={kpi.no === 12 ? tripsData?.revenueMilesByFleet : null}
                secondaryStat={
                  kpi.no === 6 ? { label: "per driver:", value: tripsData?.revenuePerActiveDriverPerWeek, unit: "$" }
                  : kpi.no === 16 ? { label: "of which detention:", value: tripsData?.detentionHoursPerActiveDriverPerWeek, unit: "hrs" }
                  : null
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
