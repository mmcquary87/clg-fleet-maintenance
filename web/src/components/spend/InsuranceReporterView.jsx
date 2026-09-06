import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, Alert } from "../../ds";
import { useMilesDriven } from "../../hooks/useMilesDriven";
import { monthRangeFor } from "../../lib/dateRangePresets";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_RATES = { auto_liability: 13.472, cargo: 1.226 };

function fmtMoney(n) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// CLG's "CLG Monthly Equipment & Insurance Reporter" workbook is filled
// out within the first 15 days of a new month, reporting on the PRIOR
// calendar month's fleet mileage -- Reporting Month = September means
// "Total Fleet Mileage" is August's total (see the workbook's own
// "Mileage" sheet: one row per completed calendar month). This ties that
// number to the same Alvys-sourced mileage the Spend page's cost/mile
// already runs on, instead of a manual pull each month.
export default function InsuranceReporterView() {
  const [reportingMonth, setReportingMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [ratesLoaded, setRatesLoaded] = useState(false);

  useEffect(() => {
    supabase.from("app_settings")
      .select("insurance_auto_liability_rate_per_100mi, insurance_cargo_rate_per_100mi")
      .single()
      .then(({ data }) => {
        if (data) {
          setRates({
            auto_liability: Number(data.insurance_auto_liability_rate_per_100mi) || DEFAULT_RATES.auto_liability,
            cargo: Number(data.insurance_cargo_rate_per_100mi) || DEFAULT_RATES.cargo,
          });
        }
        setRatesLoaded(true);
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
  const totalPremium = autoLiabilityPremium != null && cargoPremium != null ? autoLiabilityPremium + cargoPremium : null;

  return (
    <div style={{ maxWidth: 720 }}>
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

      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 10 }}>
          Mileage-based premium
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
            <tr style={{ borderTop: "2px solid var(--clg-border-default)" }}>
              <td style={{ padding: "10px 0", fontWeight: 700, color: "var(--clg-navy)" }}>Total mileage-based premium</td>
              <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, fontSize: 15, color: "var(--clg-navy)" }}>
                {totalPremium != null ? fmtMoney(totalPremium) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
          Physical Damage premium (rated on equipment value, not mileage) isn't included here yet — it needs a current
          market value per unit, which the Asset Lifecycle tile only has once comps are entered.
          {ratesLoaded && " Rates are editable in Settings — update them at each policy renewal."}
        </p>
      </Card>
    </div>
  );
}
