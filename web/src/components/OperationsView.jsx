import { useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { Card, Badge, Eyebrow } from "../ds";
import { MODULES, KPIS, APPROVED_TARGETS, FLEET_MILE_TARGETS } from "../lib/opsKpis";
import { useFleetMpg } from "../hooks/useFleetMpg";
import { useAlvysTripsReport } from "../hooks/useAlvysTripsReport";
import { useTracking } from "../hooks/useTracking";
import { useHomeTimeAdherence } from "../hooks/useHomeTimeAdherence";
import { thisMonthRange } from "../lib/dateRangePresets";
import DateRangeFilter from "./DateRangeFilter";

function formatLiveValue(kpi, value) {
  if (kpi.unit === "$") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kpi.unit === "mi") return `${Math.round(value).toLocaleString()} mi`;
  if (kpi.unit === "hrs") return `${value.toFixed(1)} hrs`;
  if (kpi.unit === "loads") return `${Math.round(value)} ${value === 1 ? "load" : "loads"}`;
  return `${value.toFixed(kpi.unit === "%" ? 1 : 2)} ${kpi.unit}`;
}

const STATUS_COLOR = {
  green: "#2E9E5B",
  yellow: "#E8C13D",
  red: "var(--clg-scarlet)",
  pending: "var(--clg-cool)",
};

// The badge should read as a verdict, not a color name — "RED" on a red
// pill is redundant with the color itself and doesn't say what's wrong.
const STATUS_LABEL = {
  green: "On target",
  yellow: "Caution",
  red: "Off target",
  pending: "Pending",
};

function toleranceStatus(value, target, tolerancePct, direction) {
  if (direction === "lowerIsBetter") {
    if (value <= target) return "green";
    if (value <= target * (1 + tolerancePct / 100)) return "yellow";
    return "red";
  }
  if (value >= target) return "green";
  if (value >= target * (1 - tolerancePct / 100)) return "yellow";
  return "red";
}

function statusFor(kpi, value) {
  // Per the framework's own governance rules, a KPI only gets a color
  // judgment once CLG has actually approved a target for it — real data
  // alone doesn't earn one. KPI 12's headline is deliberately excluded
  // even though it's live: it's a fleet-wide blend, and CLG's call
  // (2026-08-30) was that mixing segments (e.g. local with OTR) into one
  // number isn't meaningful — see the per-fleet breakdown instead.
  if (kpi.threshold.status !== "active" || value == null || kpi.no === 12) return "pending";
  if (kpi.no === 7) {
    // Framework-defined exact cutoffs (<10/10-14.9/>=15), not the generic
    // relative-tolerance shape the CLG-approved targets below use.
    if (value < 10.0) return "green";
    if (value < 15.0) return "yellow";
    return "red";
  }
  const approved = APPROVED_TARGETS[kpi.no];
  if (approved) return toleranceStatus(value, approved.target, approved.tolerancePct, approved.direction);
  return "pending";
}

function fleetRowStatus(fleetName, value) {
  const approved = FLEET_MILE_TARGETS[fleetName?.toLowerCase()];
  if (!approved || value == null) return null;
  return toleranceStatus(value, approved.target, approved.tolerancePct, "higherIsBetter");
}

function KpiCard({ kpi, liveValue, liveLoading, liveError, hasRange, breakdown, breakdownTitle, breakdownNote, secondaryStat, caveat }) {
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
          {STATUS_LABEL[status]}
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

      {caveat && hasLive && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--clg-text-muted)", lineHeight: 1.5 }}>{caveat}</div>
      )}

      {breakdown && breakdown.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--clg-border-subtle)" }}>
          <div style={{ fontSize: 9.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>
            {breakdownTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {breakdown.map((b) => (
              <div key={b.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "var(--clg-text-body)", display: "flex", alignItems: "center", gap: 6 }}>
                  {b.status && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[b.status], flexShrink: 0 }} />
                  )}
                  {b.label}
                </span>
                <span style={{ fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-navy)" }}>
                  {b.valueText}
                </span>
              </div>
            ))}
          </div>
          {breakdownNote && (
            <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginTop: 6 }}>{breakdownNote}</div>
          )}
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
  // Daily exception measure, not a range-windowed report like the others —
  // reuses the same reset-aware ETA projection the Tracking page already
  // computes rather than a separate rollup, so it always reflects live
  // active loads regardless of the date range picked above.
  const { groups: trackingGroups, loading: trackingLoading, error: trackingError } = useTracking();
  const { data: homeTimeData, loading: homeTimeLoading, error: homeTimeError } = useHomeTimeAdherence(range);

  const LIVE = {
    3: { value: tripsData?.plannedEmptyMilePct ?? null, loading: tripsLoading, error: tripsError },
    6: { value: tripsData?.revenuePerActiveTractorPerWeek ?? null, loading: tripsLoading, error: tripsError },
    7: { value: tripsData?.emptyMilePct ?? null, loading: tripsLoading, error: tripsError },
    8: { value: mpgData?.fleetMpg ?? null, loading: mpgLoading, error: mpgError },
    9: { value: tripsData?.onTimePickupPct ?? null, loading: tripsLoading, error: tripsError },
    12: { value: tripsData?.revenueMilesPerActiveDriverPerWeek ?? null, loading: tripsLoading, error: tripsError },
    15: { value: tripsData?.onTimeDeliveryPct ?? null, loading: tripsLoading, error: tripsError },
    16: { value: tripsData?.waitingDetentionHoursPerActiveDriverPerWeek ?? null, loading: tripsLoading, error: tripsError },
    "DE-01": { value: trackingLoading ? null : trackingGroups.attention.length, loading: trackingLoading, error: trackingError },
    17: { value: homeTimeData?.adherencePct ?? null, loading: homeTimeLoading, error: homeTimeError },
  };

  function breakdownFor(kpi) {
    if (kpi.no === 12) {
      if (!tripsData?.revenueMilesByFleet) return null;
      return {
        title: "BY FLEET",
        note: "Colored against each segment's approved target (OTR/Long haul ≥2,500 mi; Regional/Super Regional ≥2,000 mi) — segments without an approved target show no dot.",
        items: tripsData.revenueMilesByFleet.map((b) => ({
          key: b.fleetName,
          label: b.fleetName,
          valueText: `${b.revenueMilesPerActiveDriverPerWeek.toLocaleString()} mi (${b.activeDrivers} drivers)`,
          status: fleetRowStatus(b.fleetName, b.revenueMilesPerActiveDriverPerWeek),
        })),
      };
    }
    if (kpi.no === 16) {
      if (!tripsData) return null;
      const fmtHrs = (v) => (v == null ? "—" : `${v.toFixed(1)} hrs`);
      return {
        title: "DETENTION BY LOADING TYPE",
        note: "Detention no longer counts a driver's own early-arrival wait — only time past the stop's expected window/appointment.",
        items: [
          { key: "live", label: "Live loading", valueText: `${fmtHrs(tripsData.liveLoadDetentionHoursPerActiveDriverPerWeek)} (${tripsData.liveLoadDetentionEvents} events)`, status: null },
          { key: "dropHook", label: "Drop & Hook", valueText: `${fmtHrs(tripsData.dropHookDetentionHoursPerActiveDriverPerWeek)} (${tripsData.dropHookDetentionEvents} events)`, status: null },
        ],
      };
    }
    return null;
  }

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
            {KPIS.filter((k) => k.module === mod.id).map((kpi) => {
              const breakdown = breakdownFor(kpi);
              return (
                <KpiCard
                  key={kpi.no}
                  kpi={kpi}
                  liveValue={LIVE[kpi.no]?.value ?? null}
                  liveLoading={LIVE[kpi.no]?.loading ?? false}
                  liveError={LIVE[kpi.no]?.error ?? null}
                  hasRange={!!(range?.start && range?.end)}
                  breakdown={breakdown?.items}
                  breakdownTitle={breakdown?.title}
                  breakdownNote={breakdown?.note}
                  secondaryStat={
                    kpi.no === 6 ? { label: "per driver:", value: tripsData?.revenuePerActiveDriverPerWeek, unit: "$" }
                    : kpi.no === 16 ? { label: "of which detention:", value: tripsData?.detentionHoursPerActiveDriverPerWeek, unit: "hrs" }
                    : null
                  }
                  caveat={
                    kpi.no === 17
                      ? `Covers ${homeTimeData?.totalPlannedEvents ?? 0} recurring home-time occurrences checked against Alvys trip activity — not yet planned-day-off exceptions or approval-status filtering.${homeTimeData?.unlinkedSchedules ? ` ${homeTimeData.unlinkedSchedules} schedule(s) excluded (not linked to an Alvys driver).` : ""}`
                      : null
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
