import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, Alert, Eyebrow } from "../../ds";
import { useMilesDriven } from "../../hooks/useMilesDriven";
import { monthRangeFor } from "../../lib/dateRangePresets";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_RATES = { auto_liability: 13.472, cargo: 1.226, physical_damage: 0.171, trailer_depreciation: 0.005 };

function fmtMoney(n) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Whole calendar months between two first-of-month Dates (b after a).
// Clamped at 0 -- a reporting month before a unit's valuation baseline
// shouldn't project backward.
function monthsBetween(a, b) {
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

// CLG's "CLG Monthly Equipment & Insurance Reporter" workbook is filled
// out within the first 15 days of a new month, reporting on the PRIOR
// calendar month's fleet mileage -- Reporting Month = September means
// "Total Fleet Mileage" is August's total (see the workbook's own
// "Mileage" sheet: one row per completed calendar month). This ties that
// number to the same Alvys-sourced mileage the Spend page's cost/mile
// already runs on, instead of a manual pull each month.
//
// Physical Damage is rated on equipment value, not mileage: each
// CLG-owned unit's value (imported from the workbook's "CLG Valuation
// History" / "Market Value Update" sheets -- see
// 20260906030000_equipment_market_values.sql) depreciates forward from
// its Aug 31, 2026 baseline to the reporting month, at its own per-unit
// rate for trucks or one flat fleet-wide rate for trailers -- same split
// the workbook itself uses.
export default function InsuranceView() {
  const [reportingMonth, setReportingMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [equipmentLoading, setEquipmentLoading] = useState(true);
  const [equipmentError, setEquipmentError] = useState(null);
  const [leased, setLeased] = useState([]);
  const [leasedLoading, setLeasedLoading] = useState(true);
  const [leasedError, setLeasedError] = useState(null);

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
        setRatesLoaded(true);
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
  // leased_equipment_values table — this just reads the same rows a
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

  const mileageMonth = new Date(reportingMonth.getFullYear(), reportingMonth.getMonth() - 1, 1);
  const range = monthRangeFor(mileageMonth);
  const {
    miles, loading, error, activeTrucks,
    matchedButNoDataCount, matchedButNoDataSample,
    unmatchedTruckCount, unmatchedTruckSample,
  } = useMilesDriven(range);

  const stepMonth = (delta) => {
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

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <Eyebrow tone="brand">Insurance</Eyebrow>
        <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Monthly equipment & premium reporter</h2>
        <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
          Auto-computes what CLG's monthly insurance reporting workbook used to require pulling by hand.
        </p>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>
            Reporting month
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => stepMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--clg-royal)" }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--clg-navy)", minWidth: 130, textAlign: "center" }}>
              {monthLabel(reportingMonth)}
            </div>
            <button onClick={() => stepMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", color: "var(--clg-royal)" }}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--clg-text-muted)", margin: 0 }}>
          Filed in the first 15 days of {monthLabel(reportingMonth)}, reporting on <strong>{monthLabel(mileageMonth)}</strong>'s
          completed fleet mileage — same Alvys trip data the Spend page's cost/mile already runs on.
        </p>
      </Card>

      {error && <Alert tone="critical" title="Couldn't load mileage" style={{ marginBottom: 16 }}>{error}</Alert>}
      {equipmentError && <Alert tone="critical" title="Couldn't load equipment values" style={{ marginBottom: 16 }}>{equipmentError}</Alert>}

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 6 }}>
          Total fleet mileage — {monthLabel(mileageMonth)}
        </div>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clg-cool)", fontSize: 13, padding: "8px 0" }}>
            <Loader2 size={15} className="spin" /> Loading…
          </div>
        ) : miles != null ? (
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 28, color: "var(--clg-navy)" }}>
            {miles.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--clg-text-muted)" }}>mi</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No data for this month yet.</div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
          Across {activeTrucks} active truck{activeTrucks === 1 ? "" : "s"}. Trailers don't accrue their own mileage in Alvys.
        </div>
        {matchedButNoDataCount > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginTop: 8, lineHeight: 1.5 }}>
            {matchedButNoDataCount} truck{matchedButNoDataCount === 1 ? "" : "s"} had zero completed trips this month: {matchedButNoDataSample.slice(0, 8).join(", ")}{matchedButNoDataCount > 8 ? ", …" : ""}.
          </div>
        )}
        {unmatchedTruckCount > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--clg-scarlet)", marginTop: 4, lineHeight: 1.5 }}>
            {unmatchedTruckCount} active truck{unmatchedTruckCount === 1 ? "" : "s"} {unmatchedTruckCount === 1 ? "has" : "have"} no Alvys asset linked, so {unmatchedTruckCount === 1 ? "it isn't" : "they aren't"} counted here: {unmatchedTruckSample.slice(0, 8).join(", ")}{unmatchedTruckCount > 8 ? ", …" : ""}.
          </div>
        )}
      </Card>

      {leasedError && <Alert tone="critical" title="Couldn't load Penske/Hale values" style={{ marginBottom: 16 }}>{leasedError}</Alert>}

      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 6 }}>
          Total equipment value — {monthLabel(reportingMonth)}
        </div>
        {equipmentLoading || leasedLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clg-cool)", fontSize: 13, padding: "8px 0" }}>
            <Loader2 size={15} className="spin" /> Loading…
          </div>
        ) : grandTotalEquipmentValue != null ? (
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 28, color: "var(--clg-navy)" }}>
            {fmtMoney(grandTotalEquipmentValue)}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No unit valuations on file yet.</div>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 10 }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 0", color: "var(--clg-text-body)" }}>CLG-owned (trucks + trailers)</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>
                {clgEquipmentValue != null ? fmtMoney(clgEquipmentValue) : "—"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", color: "var(--clg-text-body)" }}>Penske (long-term lease trucks)</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>{fmtMoney(penskeValue)}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", color: "var(--clg-text-body)" }}>Hale (leased trailers)</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>{fmtMoney(haleValue)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 10, lineHeight: 1.5 }}>
          CLG-owned value depreciates forward from each unit's last reported value; Penske and Hale carry a flat
          stated value (both are reviewed periodically at renewal, not projected monthly). The Physical Damage
          premium below is rated on CLG-owned value only — Penske/Hale equipment is ordinarily insured under the
          lessor's own policy, not CLG's.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 10 }}>
          Estimated premium
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            <tr>
              <td style={{ padding: "8px 0", color: "var(--clg-text-body)" }}>
                Auto Liability — {rates.auto_liability} per 100 miles
              </td>
              <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>
                {autoLiabilityPremium != null ? fmtMoney(autoLiabilityPremium) : "—"}
              </td>
            </tr>
            <tr style={{ borderTop: "1px solid var(--clg-border-subtle)" }}>
              <td style={{ padding: "8px 0", color: "var(--clg-text-body)" }}>
                Motor Truck Cargo — {rates.cargo} per 100 miles
              </td>
              <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>
                {cargoPremium != null ? fmtMoney(cargoPremium) : "—"}
              </td>
            </tr>
            <tr style={{ borderTop: "1px solid var(--clg-border-subtle)" }}>
              <td style={{ padding: "8px 0", color: "var(--clg-text-body)" }}>
                Physical Damage — {rates.physical_damage} per $100 value
              </td>
              <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "var(--clg-navy)" }}>
                {physicalDamagePremium != null ? fmtMoney(physicalDamagePremium) : "—"}
              </td>
            </tr>
            <tr style={{ borderTop: "2px solid var(--clg-border-default)" }}>
              <td style={{ padding: "10px 0", fontWeight: 700, color: "var(--clg-navy)" }}>Total estimated premium</td>
              <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>
                {totalPremium != null ? fmtMoney(totalPremium) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
        {ratesLoaded && (
          <p style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
            Rates are editable in Settings — update them at each policy renewal.
          </p>
        )}
      </Card>
    </div>
  );
}
