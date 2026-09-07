import { useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { Card, Badge, Eyebrow, Button } from "../ds";
import { MODULES, KPIS, APPROVED_TARGETS, FLEET_MILE_TARGETS } from "../lib/opsKpis";
import { useFleetMpg } from "../hooks/useFleetMpg";
import { useAlvysTripsReport } from "../hooks/useAlvysTripsReport";
import { useTracking } from "../hooks/useTracking";
import { useHomeTimeAdherence } from "../hooks/useHomeTimeAdherence";
import { useDriveHourUtilization } from "../hooks/useDriveHourUtilization";
import { useDriverUtilization } from "../hooks/useDriverUtilization";
import { useAssignmentStability } from "../hooks/useAssignmentStability";
import { useFeasibilityReview } from "../hooks/useFeasibilityReview";
import { usePlanAdherence } from "../hooks/usePlanAdherence";
import { useIsMobile } from "../hooks/useIsMobile";
import { thisMonthRange } from "../lib/dateRangePresets";
import DateRangeFilter from "./DateRangeFilter";

const HEADLINE_KPI_NOS = [6, 7, 3, 8];

function formatLiveValue(kpi, value) {
  if (kpi.unit === "$") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (kpi.unit === "mi") return `${Math.round(value).toLocaleString()} mi`;
  if (kpi.unit === "hrs") return `${value.toFixed(1)} hrs`;
  if (kpi.unit === "loads") return `${Math.round(value)} ${value === 1 ? "load" : "loads"}`;
  return `${value.toFixed(kpi.unit === "%" ? 1 : 2)} ${kpi.unit}`;
}

// Five real dot states, not four color names on a spectrum: a KPI with no
// connected source is a different problem than one that's live but has no
// CLG-approved target yet, and both are different from one that's live,
// governed, and simply off target this period.
const STATUS_COLOR = {
  green: "#2E9E5B",
  yellow: "#E8C13D",
  red: "var(--clg-scarlet)",
  reporting: "var(--clg-royal)",
  noData: "var(--clg-cool)",
};

const STATUS_LABEL = {
  green: "On target",
  yellow: "Watch",
  red: "Off target",
  reporting: "Reporting",
  noData: "No data",
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

// Returns green/yellow/red/"pending" — a judgment only for KPIs with an
// approved target. KPI 12's fleet-wide blend is deliberately excluded even
// though it's live and its segments are governed (see the per-fleet
// breakdown for the real reads).
function statusFor(kpi, value) {
  if (kpi.threshold.status !== "active" || value == null || kpi.no === 12) return "pending";
  if (kpi.no === 7) {
    if (value < 10.0) return "green";
    if (value < 15.0) return "yellow";
    return "red";
  }
  const approved = APPROVED_TARGETS[kpi.no];
  if (approved) return toleranceStatus(value, approved.target, approved.tolerancePct, approved.direction);
  return "pending";
}

// The dot/badge state actually shown on the scorecard: folds statusFor's
// "pending" into either "reporting" (we have a real number, just no
// approved target) or "noData" (no source connected, or nothing computed
// for this range).
function dotStatus(kpi, value) {
  if (kpi.dataStatus !== "live" || value == null) return "noData";
  const s = statusFor(kpi, value);
  return s === "pending" ? "reporting" : s;
}

function typeLabel(kpi) {
  if (kpi.classification === "Supporting Control" || kpi.classification === "Daily Exception Measure") return "Supplementary";
  return kpi.type;
}

function fleetRowStatus(fleetName, value) {
  const approved = FLEET_MILE_TARGETS[fleetName?.toLowerCase()];
  if (!approved || value == null) return null;
  return toleranceStatus(value, approved.target, approved.tolerancePct, "higherIsBetter");
}

function HeadlineTile({ kpi, value, secondary }) {
  const status = statusFor(kpi, value);
  const color = STATUS_COLOR[status === "pending" ? "reporting" : status];
  return (
    <Card padding={16} style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--clg-text-muted)", textTransform: "uppercase" }}>
        {kpi.name}
      </div>
      <div style={{ marginTop: 8, fontFamily: "var(--clg-font-mono, monospace)", fontSize: 26, fontWeight: 700, color: "var(--clg-navy)" }}>
        {value != null ? formatLiveValue(kpi, value) : "—"}
      </div>
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Badge tone="outline" style={{ background: color, color: "#fff", border: "none" }}>
          {STATUS_LABEL[status === "pending" ? "reporting" : status]}
        </Badge>
        {secondary && <span style={{ fontSize: 11, color: "var(--clg-text-muted)" }}>{secondary}</span>}
      </div>
    </Card>
  );
}

export default function OperationsView() {
  const isMobile = useIsMobile();
  // Defaults to "This month" (not "All time") — Alvys's trips/search always
  // needs a bounded date range, so an unbounded default would silently
  // return nothing on first load instead of real numbers.
  const [range, setRange] = useState(thisMonthRange());
  const [selectedNo, setSelectedNo] = useState(6);
  const [formulaOpen, setFormulaOpen] = useState(false);

  const { data: mpgData, loading: mpgLoading, error: mpgError } = useFleetMpg(range);
  const { data: tripsData, loading: tripsLoading, error: tripsError } = useAlvysTripsReport(range);
  // Daily exception measure, not a range-windowed report like the others —
  // reuses the same reset-aware ETA projection the Tracking page already
  // computes rather than a separate rollup, so it always reflects live
  // active loads regardless of the date range picked above.
  const { groups: trackingGroups, loading: trackingLoading, error: trackingError } = useTracking();
  const { data: homeTimeData, loading: homeTimeLoading, error: homeTimeError } = useHomeTimeAdherence(range);
  const { data: driveHourData, loading: driveHourLoading, error: driveHourError } = useDriveHourUtilization(range);
  const { data: driverUtilData, loading: driverUtilLoading, error: driverUtilError } = useDriverUtilization(range);
  const { data: stabilityData, loading: stabilityLoading, error: stabilityError } = useAssignmentStability(range);
  const { data: feasibilityData, loading: feasibilityLoading, error: feasibilityError } = useFeasibilityReview(range);
  const { data: adherenceData, loading: adherenceLoading, error: adherenceError } = usePlanAdherence(range);

  const LIVE = {
    2: { value: stabilityData?.stabilityPct ?? null, loading: stabilityLoading, error: stabilityError },
    "SC-01": { value: feasibilityData?.reviewCompletionPct ?? null, loading: feasibilityLoading, error: feasibilityError },
    10: { value: adherenceData?.adherencePct ?? null, loading: adherenceLoading, error: adherenceError },
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
    13: { value: driveHourData?.utilizationPct ?? null, loading: driveHourLoading, error: driveHourError },
    11: { value: driverUtilData?.driverUtilizationPct ?? null, loading: driverUtilLoading, error: driverUtilError },
  };

  function breakdownFor(kpi) {
    if (!kpi) return null;
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
    if (kpi.no === 17) {
      if (!homeTimeData || homeTimeData.totalPlannedEvents === 0) return null;
      return {
        title: "PLANNED HOME-TIME DATES",
        note: "Unconfirmed = no trip conflict, but no matching Alvys event (Hometime/Restart/Vacation/SickOrEmergency) either — doesn't count toward the percentage above.",
        items: [
          { key: "honored", label: "Confirmed home", valueText: `${homeTimeData.honoredEvents}`, status: "green" },
          { key: "unconfirmed", label: "Unconfirmed", valueText: `${homeTimeData.unconfirmedEvents ?? 0}`, status: "yellow" },
          { key: "violated", label: "Violated", valueText: `${homeTimeData.violatedEvents}`, status: "red" },
        ],
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

  function secondaryStatFor(kpi) {
    if (kpi.no === 6 && tripsData?.revenuePerActiveDriverPerWeek != null) {
      return { label: "per driver:", value: tripsData.revenuePerActiveDriverPerWeek, unit: "$" };
    }
    if (kpi.no === 16 && tripsData?.detentionHoursPerActiveDriverPerWeek != null) {
      return { label: "of which detention:", value: tripsData.detentionHoursPerActiveDriverPerWeek, unit: "hrs" };
    }
    return null;
  }

  function caveatFor(kpi) {
    switch (kpi.no) {
      case 17:
        return `Covers ${homeTimeData?.totalPlannedEvents ?? 0} recurring home-time occurrences. Violated = an actual trip covered the date; Confirmed = no trip and a real Alvys event (Hometime/Restart/Vacation/SickOrEmergency) covers it; Unconfirmed = neither — not yet planned-day-off exceptions or approval-status filtering.${homeTimeData?.unlinkedSchedules ? ` ${homeTimeData.unlinkedSchedules} schedule(s) excluded (not linked to an Alvys driver).` : ""}`;
      case 11:
        return `${driverUtilData?.driversConsidered ?? 0} active drivers × days in range, minus ${driverUtilData?.rosterExceptionRows ?? 0} governed roster exception row(s) (Not Eligible or a leave window). "Productive" = a day with real Alvys trip activity.${driverUtilData?.unmatchedRosterNameCount ? ` ${driverUtilData.unmatchedRosterNameCount} roster name(s) didn't match a driver: ${driverUtilData.unmatchedRosterNames.slice(0, 3).join(", ")}${driverUtilData.unmatchedRosterNameCount > 3 ? "…" : ""}.` : ""}`;
      case 13:
        return `${driveHourData?.driversWithActivity ?? 0} of ${driveHourData?.driversConsidered ?? 0} active drivers had HOS activity this window, across ${driveHourData?.totalWorkingDays ?? 0} working-days. "Available capacity" = 11 legal drive hrs × working days, not a roster schedule.`;
      case 2:
        return `From CLG's hourly Alvys backup sheet, not a live Alvys pull. ${stabilityData?.eligibleAssignments ?? 0} of ${stabilityData?.loadsInRange ?? 0} loads in range had a driver assigned by the 72-hour checkpoint. Driver-only — tractor reassignment isn't tracked.`;
      case "SC-01":
        return `Proxy: an order reaching Dispatched status counts as "reviewed" (dispatch policy is not to dispatch infeasible loads) — no separate documented-review log exists. ${feasibilityData?.unreviewedOrders ?? 0} of ${feasibilityData?.totalOrders ?? 0} orders in range never reached Dispatched.`;
      case 10:
        return `"Final approved plan" = schedule + driver as of the load's first Dispatched snapshot. ${adherenceData?.deviationsTotal ?? 0} of ${adherenceData?.eligibleCompletedLoads ?? 0} eligible completed loads changed after that point. Tractor/trailer reassignment isn't tracked.`;
      default:
        return null;
    }
  }

  function annotationFor(kpi) {
    if (kpi.dataStatus !== "live") return "NO SOURCE";
    switch (kpi.no) {
      case 2:
        return stabilityData ? `${stabilityData.eligibleAssignments} OF ${stabilityData.loadsInRange}` : null;
      case "SC-01":
        return "PROXY";
      case 17:
        return homeTimeData ? `${homeTimeData.honoredEvents} OF ${homeTimeData.totalPlannedEvents}` : null;
      case 12:
        return "SEGMENT TARGETS";
      case "DE-01":
        return !trackingLoading ? `${trackingGroups.attention.length} OF ${tripsData?.tripsConsidered ?? "—"}` : null;
      case 10:
        return adherenceData ? `${adherenceData.eligibleCompletedLoads - adherenceData.deviationsTotal} OF ${adherenceData.eligibleCompletedLoads}` : null;
      case 13:
        return driveHourData ? `${driveHourData.driversWithActivity} OF ${driveHourData.driversConsidered}` : null;
      case 11:
        return driverUtilData ? `${driverUtilData.driversConsidered} DRIVERS` : null;
      case 16:
        return tripsData ? "BY LOADING TYPE" : null;
      default:
        return null;
    }
  }

  const primaryKpis = KPIS.filter((k) => typeof k.no === "number");
  const reportingCount = primaryKpis.filter((k) => LIVE[k.no]?.value != null).length;
  const attentionCount = primaryKpis.filter((k) => dotStatus(k, LIVE[k.no]?.value) === "red").length;
  const loadsInRange = tripsData?.tripsConsidered ?? null;

  const selected = KPIS.find((k) => k.no === selectedNo) || KPIS[0];
  const selectedLive = LIVE[selected.no] ?? { value: null, loading: false, error: null };
  const selectedStatus = dotStatus(selected, selectedLive.value);
  const selectedBreakdown = breakdownFor(selected);
  const selectedSecondary = secondaryStatFor(selected);
  const selectedCaveat = caveatFor(selected);

  // "Waiting on" — real blocker categories, grouped by why each KPI can't
  // be judged yet: no connected data source, vs. a live number with no
  // CLG-approved target. KPI 12 and DE-01 are excluded from the second
  // group: 12 is governed per-segment already, DE-01 has no traditional
  // green/yellow/red concept (framework marks it "not applicable").
  const noSourceKpis = KPIS.filter((k) => k.dataStatus === "blocked");
  const noSourceByReason = [];
  noSourceKpis.forEach((k) => {
    const row = noSourceByReason.find((r) => r.reason === k.blockedReason);
    if (row) row.nos.push(k.no);
    else noSourceByReason.push({ reason: k.blockedReason, nos: [k.no] });
  });
  const needsTargetKpis = KPIS.filter(
    (k) => k.dataStatus === "live" && k.threshold.status !== "active" && k.no !== 12 && k.no !== "DE-01"
  );

  let waitingInsight = null;
  if (tripsData?.emptyMilePct != null && tripsData?.plannedEmptyMilePct != null) {
    const delta = Math.round((tripsData.emptyMilePct - tripsData.plannedEmptyMilePct) * 10) / 10;
    waitingInsight =
      delta > 0
        ? `Actual empty miles are running ${delta} points over the plan (${tripsData.emptyMilePct}% actual vs. ${tripsData.plannedEmptyMilePct}% planned) — worth a look before it drags Revenue per Active Tractor down further.`
        : delta < 0
        ? `Actual empty miles are running ${Math.abs(delta)} points under the plan (${tripsData.emptyMilePct}% actual vs. ${tripsData.plannedEmptyMilePct}% planned).`
        : `Actual empty miles are matching the plan (${tripsData.emptyMilePct}%).`;
  }

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Operations Dashboard</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Gauge size={20} /> Weekly operating scorecard
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 640 }}>
            {reportingCount} of {primaryKpis.length} primary KPIs reporting · {attentionCount} need attention
            {loadsInRange != null ? ` · ${loadsInRange.toLocaleString()} loads in range` : ""}
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <DateRangeFilter onChange={setRange} disableAllTime />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 28 }}>
        {HEADLINE_KPI_NOS.map((no) => {
          const kpi = KPIS.find((k) => k.no === no);
          const secondary =
            no === 6 && tripsData?.revenuePerActiveDriverPerWeek != null
              ? `per driver $${Math.round(tripsData.revenuePerActiveDriverPerWeek).toLocaleString()}`
              : no === 7 && tripsData?.plannedEmptyMilePct != null
              ? `planned ${tripsData.plannedEmptyMilePct}%`
              : no === 3 && tripsData?.emptyMilePct != null
              ? `actual ${tripsData.emptyMilePct}%`
              : null;
          return <HeadlineTile key={no} kpi={kpi} value={LIVE[no]?.value ?? null} secondary={secondary} />;
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 20, alignItems: "flex-start" }}>
        <div>
          {MODULES.map((mod) => {
            const modKpis = KPIS.filter((k) => k.module === mod.id);
            const modReporting = modKpis.filter((k) => LIVE[k.no]?.value != null).length;
            return (
              <div key={mod.id} style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>{mod.name}</div>
                  <div style={{ fontSize: 11, color: "var(--clg-text-muted)" }}>{modReporting} of {modKpis.length} reporting</div>
                </div>
                <Card padding={0} style={{ overflow: "hidden" }}>
                  {modKpis.map((kpi, idx) => {
                    const value = LIVE[kpi.no]?.value ?? null;
                    const status = dotStatus(kpi, value);
                    const isSelected = kpi.no === selectedNo;
                    const annotation = annotationFor(kpi);
                    const valueText = kpi.dataStatus !== "live"
                      ? "No source"
                      : LIVE[kpi.no]?.loading
                      ? "…"
                      : value == null
                      ? "—"
                      : formatLiveValue(kpi, value);
                    return (
                      <button
                        key={kpi.no}
                        onClick={() => { setSelectedNo(kpi.no); setFormulaOpen(false); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                          background: isSelected ? "var(--clg-reflection)" : "transparent",
                          boxShadow: isSelected ? "inset 3px 0 0 var(--clg-navy)" : "none",
                          border: "none", borderTop: idx === 0 ? "none" : "1px solid var(--clg-border-subtle)",
                          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[status], flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {kpi.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--clg-text-muted)" }}>KPI {kpi.no} · {typeLabel(kpi)}</div>
                        </div>
                        {kpi.unit === "%" && value != null && (
                          <div style={{ width: 64, height: 5, borderRadius: 3, background: "var(--clg-smoke)", overflow: "hidden", flexShrink: 0, display: isMobile ? "none" : "block" }}>
                            <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: STATUS_COLOR[status] }} />
                          </div>
                        )}
                        <div style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 12.5, fontWeight: 700, color: "var(--clg-navy)", minWidth: 70, textAlign: "right", flexShrink: 0 }}>
                          {valueText}
                        </div>
                        {!isMobile && (
                          <div style={{ fontSize: 9.5, color: "var(--clg-text-muted)", minWidth: 84, textAlign: "right", flexShrink: 0, letterSpacing: "0.03em" }}>
                            {annotation}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </Card>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: "var(--clg-text-muted)", lineHeight: 1.5 }}>
            Twenty rows: 17 primary measures plus SC-01, SC-02 and DE-01. {KPIS.filter((k) => k.threshold.status === "active").length} of 20
            have a CLG-approved target; {reportingCountAll(KPIS, LIVE)} have a live number either way — the rest are pending a data source, a target, or both.
          </div>
        </div>

        <div style={{ position: isMobile ? "static" : "sticky", top: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--clg-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {typeLabel(selected)} · KPI {selected.no}
            </div>
            <div style={{ marginTop: 6 }}>
              <Badge tone="outline" style={{ background: STATUS_COLOR[selectedStatus], color: "#fff", border: "none" }}>
                {STATUS_LABEL[selectedStatus]}
              </Badge>
            </div>
            <h3 style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 17, marginTop: 10 }}>{selected.name}</h3>

            <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              {selected.dataStatus !== "live" ? (
                <span style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>{selected.blockedReason}</span>
              ) : selectedLive.loading ? (
                <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 24, color: "var(--clg-text-muted)" }}>…</span>
              ) : selectedLive.error ? (
                <span style={{ fontSize: 12.5, color: "var(--clg-scarlet)" }}>{selectedLive.error}</span>
              ) : selectedLive.value == null ? (
                <span style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>No data for this range</span>
              ) : (
                <>
                  <span style={{ fontFamily: "var(--clg-font-mono, monospace)", fontSize: 24, fontWeight: 700, color: "var(--clg-navy)" }}>
                    {formatLiveValue(selected, selectedLive.value)}
                  </span>
                  {selectedSecondary?.value != null && (
                    <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
                      · {selectedSecondary.label}{" "}
                      <span style={{ fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-text-body)", fontWeight: 600 }}>
                        {formatLiveValue({ unit: selectedSecondary.unit }, selectedSecondary.value)}
                      </span>
                    </span>
                  )}
                </>
              )}
            </div>

            {selectedCaveat && (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--clg-text-muted)", lineHeight: 1.5 }}>{selectedCaveat}</p>
            )}

            {selectedBreakdown && selectedBreakdown.items.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)" }}>
                <div style={{ fontSize: 9.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>
                  {selectedBreakdown.title}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selectedBreakdown.items.map((b) => (
                    <div key={b.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: "var(--clg-text-body)", display: "flex", alignItems: "center", gap: 6 }}>
                        {b.status && <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[b.status], flexShrink: 0 }} />}
                        {b.label}
                      </span>
                      <span style={{ fontFamily: "var(--clg-font-mono, monospace)", color: "var(--clg-navy)" }}>{b.valueText}</span>
                    </div>
                  ))}
                </div>
                {selectedBreakdown.note && (
                  <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginTop: 6 }}>{selectedBreakdown.note}</div>
                )}
              </div>
            )}

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)" }}>
              <div style={{ fontSize: 9.5, color: "var(--clg-text-muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>
                SOURCE &amp; DEFINITION
              </div>
              <div style={{ fontSize: 12, color: "var(--clg-text-body)", lineHeight: 1.5 }}>{selected.source}</div>
            </div>

            <button
              onClick={() => setFormulaOpen((o) => !o)}
              style={{
                marginTop: 12, background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--clg-royal)",
              }}
            >
              <ChevronDown size={12} style={{ transform: formulaOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              Formula &amp; thresholds
            </button>
            {formulaOpen && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--clg-text-muted)", lineHeight: 1.5 }}>
                <div><strong>Formula:</strong> {selected.formula}</div>
                <div style={{ marginTop: 4 }}>
                  <strong>Thresholds:</strong> Green {selected.threshold.green} · Yellow {selected.threshold.yellow} · Red {selected.threshold.red}
                </div>
                <div style={{ marginTop: 4 }}>{selected.classification}</div>
              </div>
            )}

            {selected.no === 12 ? (
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--clg-royal)" }}>Judged per fleet segment — see the breakdown above, not a single fleet-wide target.</div>
            ) : selected.threshold.status !== "active" ? (
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--clg-royal)" }}>Methodology not yet approved by CLG.</div>
            ) : null}
          </Card>

          <Card padding={20}>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
              What the scorecard is waiting on
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {noSourceByReason.map((row) => (
                <li key={row.reason} style={{ fontSize: 12, color: "var(--clg-text-body)", lineHeight: 1.5 }}>
                  <strong>{row.nos.length} KPI{row.nos.length > 1 ? "s" : ""} (No. {row.nos.join(", ")}) need a data source</strong> — {row.reason}
                </li>
              ))}
              {needsTargetKpis.length > 0 && (
                <li style={{ fontSize: 12, color: "var(--clg-text-body)", lineHeight: 1.5 }}>
                  <strong>{needsTargetKpis.length} KPI{needsTargetKpis.length > 1 ? "s" : ""} (No. {needsTargetKpis.map((k) => k.no).join(", ")}) have live data but no CLG-approved target</strong> — thresholds shown are the framework's proposed bands, not yet activated.
                </li>
              )}
            </ol>
            {waitingInsight && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--clg-text-body)", lineHeight: 1.5, fontStyle: "italic" }}>{waitingInsight}</div>
            )}
            <div style={{ marginTop: 14 }}>
              <Button size="sm" disabled title="No in-app approval workflow yet — a target becomes official by CLG confirming it and it being added to APPROVED_TARGETS in code.">
                Approve methodology
              </Button>
              <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--clg-text-muted)" }}>
                Not wired up yet — approving a target today means CLG confirming it and a code change, not a click here.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function reportingCountAll(kpis, LIVE) {
  return kpis.filter((k) => LIVE[k.no]?.value != null).length;
}
