import { useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, Eyebrow, Badge, Button, Field, Input, Select, Alert } from "../../ds";
import { useAssetLifecycle } from "../../hooks/useAssetLifecycle";

// Asset_Lifecycle_Disposal_Spec.md, phase 1: the per-unit tile in the
// Spend page's "By unit" drill-down (§7's explicit phase-one interface).
// Manager/Leadership + Maintenance decision tool -- the parent gates this
// out of the mechanic role's day-to-day view (spec §7).

const STATE_TONE = { hold: "neutral", monitor: "accent", release_window: "brand", release_risk: "critical" };
const CLAIM_OPTIONS = [
  { value: "n_a", label: "N/A" },
  { value: "not_filed", label: "Not filed" },
  { value: "covered", label: "Covered" },
  { value: "denied", label: "Denied" },
];

function fmtMoney(n) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 15, color: tone || "var(--clg-navy)", fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function CompForm({ onAdd, onCancel }) {
  const [source, setSource] = useState("TruckPaper");
  const [pulledAt, setPulledAt] = useState(new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!mileage || !price) return;
    setSaving(true);
    setError(null);
    const err = await onAdd({
      source: source.trim() || "TruckPaper", pulled_at: pulledAt,
      comp_year: year ? Number(year) : null, comp_make: make.trim() || null, comp_model: model.trim() || null,
      comp_engine: engine.trim() || null, comp_mileage: Number(mileage), comp_asking_price: Number(price),
    });
    setSaving(false);
    if (err) setError(err.message);
    else onCancel();
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: 14, background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)", marginTop: 10 }}>
      {error && <div style={{ gridColumn: "1 / -1" }}><Alert tone="critical">{error}</Alert></div>}
      <Field label="Source"><Input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
      <Field label="Pulled on"><Input type="date" value={pulledAt} onChange={(e) => setPulledAt(e.target.value)} /></Field>
      <Field label="Mileage" required><Input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} /></Field>
      <Field label="Asking price ($)" required><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <Field label="Year"><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
      <Field label="Make"><Input value={make} onChange={(e) => setMake(e.target.value)} /></Field>
      <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
      <Field label="Engine"><Input value={engine} onChange={(e) => setEngine(e.target.value)} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", gap: 8, alignItems: "flex-end", justifyContent: "flex-end" }}>
        <Button size="sm" type="button" variant="quiet" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={saving} iconLeft={saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}>
          {saving ? "Saving…" : "Add comp"}
        </Button>
      </div>
    </form>
  );
}

export default function AssetLifecycleCard({ unitNumber }) {
  const { unit, result, comps, loading, error, addComp, deleteComp, setWarrantyClaimStatus } = useAssetLifecycle(unitNumber);
  const [showCompForm, setShowCompForm] = useState(false);
  const [showComps, setShowComps] = useState(false);

  if (loading) {
    return (
      <Card style={{ marginTop: 18, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--clg-cool)", fontSize: 13 }}>
          <Loader2 size={15} className="spin" /> Loading asset lifecycle…
        </div>
      </Card>
    );
  }
  if (error || !unit || !result) {
    return null; // no unit row (e.g. a misentered invoice reference, see UnitView's looksLikeUnitNumber) -- nothing useful to show
  }

  return (
    <Card style={{ marginTop: 18, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <div>
          <Eyebrow tone="brand">Asset lifecycle</Eyebrow>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 16, color: "var(--clg-navy)", marginTop: 4 }}>
            Buy / sell decision signal
          </div>
        </div>
        <Badge tone={STATE_TONE[result.state]}>{result.stateLabel}</Badge>
      </div>
      <p style={{ fontSize: 13, color: "var(--clg-text-body)", margin: "6px 0 18px", lineHeight: 1.55 }}>{result.driverText}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16, paddingBottom: 16, borderBottom: "1px solid var(--clg-border-subtle)" }}>
        <Stat label="Odometer" value={unit.odometer ? `${unit.odometer.toLocaleString()} mi` : "—"} />
        <Stat
          label="Age"
          value={result.ageYears != null ? `${result.ageYears.toFixed(1)} yr${result.ageIsApproximate ? " (approx.)" : ""}` : "—"}
        />
        <Stat
          label="Est. market value"
          value={result.marketValue.insufficient ? "Not enough comps" : fmtMoney(result.marketValue.estimatedValue)}
        />
        <Stat label="Cumulative spend" value={fmtMoney(result.cumulativeSpend)} />
        <Stat
          label="Net position"
          value={result.netPosition != null ? fmtMoney(result.netPosition) : "—"}
          tone={result.netPosition == null ? undefined : result.netPosition >= 0 ? "var(--clg-royal)" : "var(--clg-scarlet)"}
        />
      </div>

      {result.reliability.count > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginBottom: 8 }}>
            Reliability flags ({result.reliability.count})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.reliability.events.map((wo) => (
              <div key={wo.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, color: "var(--clg-text-heading)", fontWeight: 600 }}>{wo.category} — {fmtMoney(wo.cost)}</div>
                  <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 2 }}>
                    {wo.date_opened} · {wo.triggers.includes("single_invoice") ? "over threshold" : "category match"}
                  </div>
                </div>
                <div style={{ width: 150 }}>
                  <Select
                    value={wo.warranty_claim_status ?? "n_a"}
                    onChange={(e) => setWarrantyClaimStatus(wo.id, e.target.value)}
                    options={CLAIM_OPTIONS}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => setShowComps((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}
        >
          {showComps ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Market comps ({comps.length}){result.compsStale && comps.length > 0 ? " — stale" : ""}
        </button>

        {showComps && (
          <div style={{ marginTop: 10 }}>
            {comps.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>No comps on file yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {comps.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    <span style={{ flex: 1 }}>
                      {[c.comp_year, c.comp_make, c.comp_model].filter(Boolean).join(" ") || "—"}
                      {c.comp_engine ? ` · ${c.comp_engine}` : ""} — {c.comp_mileage.toLocaleString()} mi — {fmtMoney(c.comp_asking_price)}
                    </span>
                    <span style={{ color: "var(--clg-text-muted)" }}>{c.source}, {c.pulled_at}</span>
                    <button onClick={() => deleteComp(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", display: "flex" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showCompForm ? (
              <CompForm onAdd={addComp} onCancel={() => setShowCompForm(false)} />
            ) : (
              <Button size="sm" variant="outline" style={{ marginTop: 10 }} iconLeft={<Plus size={14} />} onClick={() => setShowCompForm(true)}>
                Add comp
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
