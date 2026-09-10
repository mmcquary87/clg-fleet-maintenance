import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Download, CheckCircle2 } from "lucide-react";
import { Card, Alert, Eyebrow, Badge, Button } from "../../ds";
import { useMilesDriven } from "../../hooks/useMilesDriven";
import { useInsuranceFiling } from "../../hooks/useInsuranceFiling";
import { useIsMobile } from "../../hooks/useIsMobile";
import { monthRangeFor } from "../../lib/dateRangePresets";
import { downloadCsv } from "../../lib/exportCsv";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_RATES = { auto_liability: 13.472, cargo: 1.226, physical_damage: 0.171, trailer_depreciation: 0.005 };

// A truck's own number is either plain digits (CLG's own numbering) or a
// PK- prefix (Penske-leased, see 20260907030000_import_leased_units.sql).
// Anything else sitting in the active-truck register is a data-entry
// mistake, not a real unit -- confirmed live on 2026-09-09/10: a work
// order vendor note literally typed "Parts" into units.number, and a
// trailer got created with type "Truck" by mistake ("Trailer 100143").
// Both inflate the truck count the cargo/liability premium is rated on.
function isPlausibleTruckNumber(number) {
  return /^\d+$/.test(number) || /^PK-/.test(number);
}

function fmtMoney(n) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function shortMonthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Whole calendar months between two first-of-month Dates (b after a).
// Clamped at 0 -- a reporting month before a unit's valuation baseline
// shouldn't project backward.
function monthsBetween(a, b) {
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

function Chip({ children }) {
  return (
    <span style={{
      display: "inline-block", padding: "5px 10px", borderRadius: "var(--clg-radius-sm)",
      background: "var(--clg-smoke)", fontSize: 12, fontFamily: "var(--clg-font-mono, monospace)",
      color: "var(--clg-navy)",
    }}>
      {children}
    </span>
  );
}

function SectionLabel({ children, tone }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      color: tone === "critical" ? "var(--clg-scarlet)" : "var(--clg-text-muted)", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

// CLG's "CLG Monthly Equipment & Insurance Reporter" workbook is filled
// out within the first 15 days of a new month, reporting on the PRIOR
// calendar month's fleet mileage -- Reporting Month = September means
// "Total Fleet Mileage" is August's total (see the workbook's own
// "Mileage" sheet: one row per completed calendar month). This ties that
// number to the same Alvys-sourced mileage the Spend page's cost/mile
// already runs on.
//
// Physical Damage is rated on equipment value, not mileage: each
// CLG-owned unit's value (imported from the workbook's "CLG Valuation
// History" / "Market Value Update" sheets -- see
// 20260906030000_equipment_market_values.sql) depreciates forward from
// its Aug 31, 2026 baseline to the reporting month, at its own per-unit
// rate for trucks or one flat fleet-wide rate for trailers -- same split
// the workbook itself uses.
//
// Layout follows the 2026-09-10 design package's Insurance.html export
// (two-column, headline tiles, an exceptions sidebar). The rate NUMBERS
// in that mockup don't match this page's real, workbook-sourced rates
// (e.g. it rates cargo per active power unit at a flat $/unit instead of
// per mile) -- kept this page's actual confirmed methodology instead of
// the mockup's invented one; see the "Rated on" column below.
export default function InsuranceView({ onGoToUnits }) {
  const isMobile = useIsMobile();
  const [reportingMonth, setReportingMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [equipment, setEquipment] = useState([]);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [equipmentError, setEquipmentError] = useState(null);
  const [leased, setLeased] = useState([]);
  const [leasedLoading, setLeasedLoading] = useState(true);
  const [leasedError, setLeasedError] = useState(null);
  const [malformedTrucks, setMalformedTrucks] = useState([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [filedJustNow, setFiledJustNow] = useState(false);

  useEffect(() => {
    supabase.from("app_settings")
      .select("insurance_auto_liability_rate_per_100mi, insurance_cargo_rate_per_100mi, insurance_physical_damage_rate_per_100, insurance_trailer_depreciation_pct")
      .single()
      .then(({ data }) => {
        if (data) {
          setRates({
            auto_liability: Number(data.insurance_auto_liability_rate_per_100mi) || DEFAULT_RATES.auto_liability,
            cargo: Number(data.insurance_cargo_rate_per_100mi) || DEFAULT_RATES.cargo,
            physical_damage: Number(data.insurance_physical_damage_rate_per_100) || DEFAULT_RATES.physical_damage,
            trailer_depreciation: Number(data.insurance_trailer_depreciation_pct) || DEFAULT_RATES.trailer_depreciation,
          });
        }
      });
  }, []);

  useEffect(() => {
    supabase.from("units")
      .select("number, type, current_market_value, current_market_value_date, market_value_mom_depreciation_pct")
      .eq("is_active", true)
      .eq("ownership", "owned")
      .not("current_market_value", "is", null)
      .then(({ data, error: err }) => {
        if (err) { setEquipmentError(err.message); setEquipment([]); } else { setEquipment(data ?? []); }
        setEquipmentLoading(false);
      });
  }, []);

  // Penske/Hale leased equipment now lives in `units` too (ownership !=
  // 'owned', imported 2026-09-07 so it's a first-class unit with its own
  // drawer/work-order history) rather than the old standalone
  // leased_equipment_values table -- this just reads the same rows a
  // different way.
  useEffect(() => {
    supabase.from("units")
      .select("ownership, current_market_value")
      .neq("ownership", "owned")
      .then(({ data, error: err }) => {
        if (err) { setLeasedError(err.message); setLeased([]); } else { setLeased(data ?? []); }
        setLeasedLoading(false);
      });
  }, []);

  useEffect(() => {
    supabase.from("units")
      .select("number")
      .eq("type", "Truck")
      .eq("is_active", true)
      .then(({ data }) => {
        setMalformedTrucks((data ?? []).map((u) => u.number).filter((n) => !isPlausibleTruckNumber(n)));
      });
  }, []);

  const mileageMonth = new Date(reportingMonth.getFullYear(), reportingMonth.getMonth() - 1, 1);
  const range = monthRangeFor(mileageMonth);
  const {
    miles, loading, error, activeTrucks,
    matchedButNoDataCount, matchedButNoDataSample,
    unmatchedTruckCount, unmatchedTruckSample,
  } = useMilesDriven(range);

  const { filing, loading: filingLoading, saving: filingSaving, markFiled } = useInsuranceFiling(reportingMonth);

  const stepMonth = (delta) => {
    setFiledJustNow(false);
    setReportingMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const autoLiabilityPremium = miles != null ? (miles * rates.auto_liability) / 100 : null;
  const cargoPremium = miles != null ? (miles * rates.cargo) / 100 : null;

  let truckValue = 0;
  let trailerValue = 0;
  for (const u of equipment) {
    const baseline = new Date(u.current_market_value_date);
    const baselineMonth = new Date(baseline.getFullYear(), baseline.getMonth(), 1);
    const months = monthsBetween(baselineMonth, reportingMonth);
    const rate = u.type === "Truck" ? Number(u.market_value_mom_depreciation_pct) || 0 : rates.trailer_depreciation;
    const depreciated = Number(u.current_market_value) * Math.pow(1 - rate, months);
    if (u.type === "Truck") truckValue += depreciated;
    else trailerValue += depreciated;
  }
  // CLG-owned only -- what the Physical Damage premium is actually rated
  // on, per the workbook's own stated scope (Penske/Hale equipment is
  // ordinarily insured under the lessor's own policy, not CLG's).
  const clgEquipmentValue = equipment.length > 0 ? truckValue + trailerValue : null;
  const physicalDamagePremium = clgEquipmentValue != null ? (clgEquipmentValue * rates.physical_damage) / 100 : null;

  // Penske/Hale carry a flat stated value (no monthly depreciation
  // modeled -- see 20260906040000_leased_equipment_values.sql) --
  // informational total exposure across every equipment type CLG
  // operates, not part of the premium base above.
  let penskeValue = 0;
  let haleValue = 0;
  for (const l of leased) {
    if (l.ownership === "penske_lease") penskeValue += Number(l.current_market_value) || 0;
    else haleValue += Number(l.current_market_value) || 0;
  }
  const grandTotalEquipmentValue = clgEquipmentValue != null ? clgEquipmentValue + penskeValue + haleValue : null;

  const totalPremium = [autoLiabilityPremium, cargoPremium, physicalDamagePremium].every((v) => v != null)
    ? autoLiabilityPremium + cargoPremium + physicalDamagePremium
    : null;

  const exceptionCount = unmatchedTruckCount + malformedTrucks.length;
  const dueDate = new Date(reportingMonth.getFullYear(), reportingMonth.getMonth(), 15);
  const daysUntilDue = Math.ceil((dueDate - new Date()) / 86400000);
  const canFile = miles != null && grandTotalEquipmentValue != null && totalPremium != null;

  const handleExport = () => {
    setExportBusy(true);
    downloadCsv(`insurance-filing-${reportingMonth.toISOString().slice(0, 7)}.csv`, [{
      reportingMonth: monthLabel(reportingMonth),
      mileageMonth: monthLabel(mileageMonth),
      fleetMileage: miles ?? "",
      equipmentValue: grandTotalEquipmentValue != null ? grandTotalEquipmentValue.toFixed(2) : "",
      activePowerUnits: activeTrucks,
      estimatedPremium: totalPremium != null ? totalPremium.toFixed(2) : "",
    }], [
      { label: "Reporting month", value: (r) => r.reportingMonth },
      { label: "Mileage month", value: (r) => r.mileageMonth },
      { label: "Fleet mileage (mi)", value: (r) => r.fleetMileage },
      { label: "Equipment value ($)", value: (r) => r.equipmentValue },
      { label: "Active power units", value: (r) => r.activePowerUnits },
      { label: "CLG estimated premium ($, not part of the submission)", value: (r) => r.estimatedPremium },
    ]);
    setExportBusy(false);
  };

  const handleMarkFiled = async () => {
    if (!canFile) return;
    const err = await markFiled({ fleetMileage: miles, equipmentValue: grandTotalEquipmentValue, estimatedPremium: totalPremium });
    if (!err) setFiledJustNow(true);
  };

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div>
          <Eyebrow tone="brand">Insurance</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Monthly equipment &amp; premium filing</h2>
          <p style={{ fontSize: 13, color: "var(--clg-text-muted)", marginTop: 6, maxWidth: 620, lineHeight: 1.6 }}>
            Computes the three figures the insurer asks for each month from Alvys trip data and the unit register —
            the same source the Spend page's cost per mile runs on.
          </p>
        </div>
        <div style={{ display: "flex", gap: 9, flexShrink: 0 }}>
          <Button variant="outline" size="sm" iconLeft={<Download size={14} />} onClick={handleExport} disabled={exportBusy || !canFile}>
            Export filing
          </Button>
          {filing || filedJustNow ? (
            <Badge tone="brand" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "10px 14px" }}>
              <CheckCircle2 size={13} /> Filed
            </Badge>
          ) : (
            <Button size="sm" onClick={handleMarkFiled} disabled={!canFile || filingSaving}
              iconLeft={filingSaving ? <Loader2 size={14} className="spin" /> : null}>
              {filingSaving ? "Saving…" : "Mark as filed"}
            </Button>
          )}
        </div>
      </div>

      <Card style={{ marginBottom: 14, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Reporting month</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button onClick={() => stepMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--clg-royal)" }}>
                  <ChevronLeft size={16} />
                </button>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--clg-navy)", padding: "6px 12px", borderRadius: "var(--clg-radius-sm)", minWidth: 130, textAlign: "center" }}>
                  {monthLabel(reportingMonth)}
                </div>
                <button onClick={() => stepMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--clg-royal)" }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>
              <span style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10.5 }}>Due </span>
              <strong style={{ color: "var(--clg-text-body)" }}>{dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong>
              {!filing && !filedJustNow && (
                <> {daysUntilDue >= 0 ? `in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}` : `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} past due`}</>
              )}
            </div>
          </div>
          {exceptionCount > 0 && !filingLoading && (
            <Badge tone="critical">{exceptionCount} exception{exceptionCount === 1 ? "" : "s"} to resolve</Badge>
          )}
        </div>
      </Card>

      <div style={{ fontSize: 12, color: "var(--clg-text-muted)", background: "var(--clg-surface-subtle)", padding: "10px 16px", borderRadius: "var(--clg-radius-sm)", marginBottom: 20, lineHeight: 1.5 }}>
        Mileage reports <strong>{shortMonthLabel(mileageMonth).split(" ")[0]}</strong> completed trips · equipment value reports{" "}
        <strong>{shortMonthLabel(reportingMonth).split(" ")[0]}</strong> holdings — the insurer asks for the month behind on miles and the month ahead on value.
      </div>

      {error && <Alert tone="critical" title="Couldn't load mileage" style={{ marginBottom: 16 }}>{error}</Alert>}
      {equipmentError && <Alert tone="critical" title="Couldn't load equipment values" style={{ marginBottom: 16 }}>{equipmentError}</Alert>}
      {leasedError && <Alert tone="critical" title="Couldn't load Penske/Hale values" style={{ marginBottom: 16 }}>{leasedError}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Card padding={18}>
          <SectionLabel>Fleet mileage · {shortMonthLabel(mileageMonth)}</SectionLabel>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clg-cool)", fontSize: 13 }}>
              <Loader2 size={15} className="spin" /> Loading…
            </div>
          ) : miles != null ? (
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: "var(--clg-navy)" }}>
              {miles.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-muted)" }}>mi</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No data for this month yet.</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 8 }}>
            {activeTrucks} active trucks. Trailers accrue no mileage of their own in Alvys.
          </div>
        </Card>
        <Card padding={18}>
          <SectionLabel>Equipment value · {shortMonthLabel(reportingMonth)}</SectionLabel>
          {equipmentLoading || leasedLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clg-cool)", fontSize: 13 }}>
              <Loader2 size={15} className="spin" /> Loading…
            </div>
          ) : grandTotalEquipmentValue != null ? (
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: "var(--clg-navy)" }}>
              {fmtMoney(grandTotalEquipmentValue)}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No unit valuations on file yet.</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 8 }}>
            Across three owners. CLG-owned depreciates forward; leases are stated flat.
          </div>
        </Card>
        <Card padding={18} style={{ background: "var(--clg-navy)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-mercury)", marginBottom: 10 }}>
            Estimated premium
          </div>
          {totalPremium != null ? (
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: "#fff" }}>
              {fmtMoney(totalPremium)} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-mercury)" }}>/mo</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--clg-mercury)" }}>—</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--clg-mercury)", marginTop: 8 }}>
            What the two figures above imply at current rates.
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.7fr 1fr", gap: 20, alignItems: "flex-start" }}>
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <SectionLabel>Equipment value — {monthLabel(reportingMonth)}</SectionLabel>
              <span style={{ fontSize: 11, color: "var(--clg-text-faint, var(--clg-text-muted))" }}>Reviewed at renewal, not projected monthly</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "10px 0" }}>
                    <div style={{ fontWeight: 600, color: "var(--clg-navy)" }}>CLG-owned</div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>Trucks and trailers on the register · depreciates forward from each unit's last reported value</div>
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right", verticalAlign: "top", fontWeight: 700, color: "var(--clg-navy)", whiteSpace: "nowrap" }}>
                    {clgEquipmentValue != null ? fmtMoney(clgEquipmentValue) : "—"}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--clg-border-subtle)" }}>
                  <td style={{ padding: "10px 0" }}>
                    <div style={{ fontWeight: 600, color: "var(--clg-navy)" }}>Penske</div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>Long-term lease trucks · flat stated value</div>
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right", verticalAlign: "top", fontWeight: 700, color: "var(--clg-navy)", whiteSpace: "nowrap" }}>{fmtMoney(penskeValue)}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--clg-border-subtle)" }}>
                  <td style={{ padding: "10px 0" }}>
                    <div style={{ fontWeight: 600, color: "var(--clg-navy)" }}>Hale</div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>Leased trailers · flat stated value</div>
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right", verticalAlign: "top", fontWeight: 700, color: "var(--clg-navy)", whiteSpace: "nowrap" }}>{fmtMoney(haleValue)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid var(--clg-border-default)" }}>
                  <td style={{ padding: "12px 0", fontWeight: 700, color: "var(--clg-navy)" }}>Total equipment value</td>
                  <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", whiteSpace: "nowrap" }}>
                    {grandTotalEquipmentValue != null ? fmtMoney(grandTotalEquipmentValue) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 8, lineHeight: 1.5, background: "var(--clg-surface-subtle)", padding: "10px 12px", borderRadius: "var(--clg-radius-sm)" }}>
              Physical Damage is rated on the <strong>CLG-owned {clgEquipmentValue != null ? fmtMoney(clgEquipmentValue).replace(".00", "") : "—"} only</strong>. Penske
              and Hale equipment is ordinarily insured under the lessor's own policy — so the leased share above carries no premium here.
            </div>
          </Card>

          <Card>
            <SectionLabel>How the premium is built</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Coverage", "Rated on", "Rate", "Monthly"].map((h) => (
                    <th key={h} style={{
                      textAlign: h === "Monthly" ? "right" : "left", padding: "0 0 8px", fontFamily: "var(--clg-font-heading)",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)",
                      borderBottom: "2px solid var(--clg-border-default)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "10px 0", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>Auto liability</td>
                  <td style={{ padding: "10px 0", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{miles != null ? `${miles.toLocaleString()} mi run in ${shortMonthLabel(mileageMonth)}` : "—"}</td>
                  <td style={{ padding: "10px 0", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>${rates.auto_liability} / 100 mi</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>
                    {autoLiabilityPremium != null ? fmtMoney(autoLiabilityPremium) : "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 0", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>Physical damage</td>
                  <td style={{ padding: "10px 0", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{clgEquipmentValue != null ? `${fmtMoney(clgEquipmentValue)} CLG-owned value` : "—"}</td>
                  <td style={{ padding: "10px 0", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>{rates.physical_damage} / $100 value</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>
                    {physicalDamagePremium != null ? fmtMoney(physicalDamagePremium) : "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 0", fontWeight: 600, color: "var(--clg-navy)" }}>Motor truck cargo</td>
                  <td style={{ padding: "10px 0", color: "var(--clg-text-muted)" }}>{miles != null ? `${miles.toLocaleString()} mi run in ${shortMonthLabel(mileageMonth)}` : "—"}</td>
                  <td style={{ padding: "10px 0", color: "var(--clg-text-muted)", whiteSpace: "nowrap" }}>${rates.cargo} / 100 mi</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, color: "var(--clg-navy)", whiteSpace: "nowrap" }}>
                    {cargoPremium != null ? fmtMoney(cargoPremium) : "—"}
                  </td>
                </tr>
                <tr style={{ borderTop: "2px solid var(--clg-border-default)" }}>
                  <td colSpan={3} style={{ padding: "12px 0", fontWeight: 700, color: "var(--clg-navy)" }}>Estimated monthly premium</td>
                  <td style={{ padding: "12px 0", textAlign: "right", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)", whiteSpace: "nowrap" }}>
                    {totalPremium != null ? fmtMoney(totalPremium) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 12, lineHeight: 1.5 }}>
              Liability is {totalPremium ? Math.round((autoLiabilityPremium / totalPremium) * 100) : "—"}% of the bill and moves with miles run, so the mileage
              figure — not the equipment value — is what changes the premium month to month. Rates are editable in Settings; update them at each policy renewal.
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {exceptionCount > 0 && (
            <Card style={{ borderTop: "3px solid var(--clg-scarlet)" }}>
              <SectionLabel tone="critical">Resolve before filing</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: unmatchedTruckCount > 0 && malformedTrucks.length > 0 ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 14 }}>
                {unmatchedTruckCount > 0 && (
                  <div style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-scarlet)" }}>{unmatchedTruckCount}</div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>active truck{unmatchedTruckCount === 1 ? "" : "s"} with no Alvys asset linked</div>
                  </div>
                )}
                {malformedTrucks.length > 0 && (
                  <div style={{ background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", padding: "10px 12px" }}>
                    <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-scarlet)" }}>{malformedTrucks.length}</div>
                    <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>malformed unit number{malformedTrucks.length === 1 ? "" : "s"} in the truck register</div>
                  </div>
                )}
              </div>

              {unmatchedTruckCount > 0 && (
                <>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--clg-text-body)", marginBottom: 6 }}>Not counted in the {miles?.toLocaleString() ?? "—"} mi</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {unmatchedTruckSample.slice(0, 8).map((n) => <Chip key={n}>{n}</Chip>)}
                    {unmatchedTruckCount > 8 && <Chip>+{unmatchedTruckCount - 8} more</Chip>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
                    {unmatchedTruckCount === 1 ? "This truck is" : "These trucks are"} flagged active but {unmatchedTruckCount === 1 ? "carries" : "carry"} no linked Alvys asset, so {unmatchedTruckCount === 1 ? "its" : "their"} miles are invisible to the filing.
                  </div>
                </>
              )}

              {malformedTrucks.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--clg-text-body)", marginBottom: 4 }}>
                    "{malformedTrucks[0]}"{malformedTrucks.length > 1 ? ` and ${malformedTrucks.length - 1} more` : ""} listed as a truck
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", lineHeight: 1.5 }}>
                    A non-numeric ID sits in the active-truck register alongside real unit numbers. It inflates the {activeTrucks} count the cargo premium is rated on.
                  </div>
                </div>
              )}

              {onGoToUnits && (
                <Button variant="primary" size="sm" fullWidth onClick={onGoToUnits}>Open the unit register</Button>
              )}
            </Card>
          )}

          {matchedButNoDataCount > 0 && (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <SectionLabel>Zero-trip trucks</SectionLabel>
                <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 20, color: "var(--clg-navy)" }}>{matchedButNoDataCount}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                Of {activeTrucks} active trucks, {matchedButNoDataCount} completed no trips in {shortMonthLabel(mileageMonth)}.
                {activeTrucks > 0 && ` That's ${Math.round((matchedButNoDataCount / activeTrucks) * 100)}% of the fleet earning nothing while still carrying physical damage premium.`}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {matchedButNoDataSample.slice(0, 14).map((n) => <Chip key={n}>{n}</Chip>)}
                {matchedButNoDataCount > 14 && <Chip>+{matchedButNoDataCount - 14} more</Chip>}
              </div>
              <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                Worth checking against the register before filing — a truck that's been sold or parked shouldn't be rated as active.
              </div>
            </Card>
          )}

          <Card>
            <SectionLabel>What gets submitted</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--clg-text-body)" }}>{shortMonthLabel(mileageMonth)} fleet mileage</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>{miles != null ? `${miles.toLocaleString()} mi` : "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--clg-text-body)" }}>{shortMonthLabel(reportingMonth)} equipment value</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>{grandTotalEquipmentValue != null ? fmtMoney(grandTotalEquipmentValue) : "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--clg-text-body)" }}>Active power units</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>{activeTrucks}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 10, lineHeight: 1.5 }}>
              These three figures replace what used to be pulled by hand into the workbook. The estimated premium above is CLG's own estimate and isn't part of the submission.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
