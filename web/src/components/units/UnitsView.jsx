import { useMemo, useState } from "react";
import { Plus, Loader2, Search } from "lucide-react";
import { Button, Badge, Eyebrow, Alert, Input } from "../../ds";
import { useUnits } from "../../hooks/useUnits";
import { useUnitActivity } from "../../hooks/useUnitActivity";
import { useUnitFaults } from "../../hooks/useUnitFaults";
import { useIsMobile } from "../../hooks/useIsMobile";
import { worstStatus } from "../../lib/maintenanceSchedule";
import UnitForm from "./UnitForm";
import UnitDetailPage from "./UnitDetailPage";

const OWNERSHIP_BADGE = { penske_lease: "Penske", hale_lease: "Hale" };

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString();
}

function conditionFor(unit, faults) {
  if (unit.can_move_load === false) return "down";
  if (faults?.activeSeverity) return "check_engine";
  return "ok";
}

function ConditionDot({ condition }) {
  const style = {
    down: { background: "var(--clg-ruby)", border: "none" },
    check_engine: { background: "transparent", border: "2px solid var(--clg-ruby)" },
    ok: { background: "var(--clg-royal)", border: "none" },
  }[condition];
  return <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, display: "inline-block", ...style }} />;
}

function maintenanceBadge(status) {
  if (status === "overdue") return { tone: "critical", label: "Overdue" };
  if (status === "due_soon") return { tone: "accent", label: "Due soon" };
  return null;
}

// Sticky, lightweight glance panel -- deliberately not a place to cram every
// tab of the full unit page. Documents, the check-in log, work-order
// history, and the maintenance schedule editor all stay one click away via
// "View full profile" rather than being squeezed in here; this panel's job
// is the same one the design gave it: enough to judge the row without
// leaving the list.
function UnitPanel({ unit, activity, faults, isMobile, onOpenFull, onToggleActive }) {
  const isTrailer = unit.type === "Trailer";
  const condition = conditionFor(unit, faults);
  const maint = maintenanceBadge(worstStatus(unit));
  const openOrder = activity?.openOrder;

  return (
    <div style={{
      background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-raised)",
      borderTop: condition !== "ok" ? "3px solid var(--clg-scarlet)" : undefined,
      padding: 18, position: isMobile ? "static" : "sticky", top: 16, alignSelf: "start",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-royal)" }}>
        {unit.type}{!unit.is_active && " · Inactive"}
        {OWNERSHIP_BADGE[unit.ownership] && <Badge tone="brand" style={{ marginLeft: 4 }}>{OWNERSHIP_BADGE[unit.ownership]}</Badge>}
      </div>
      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: "var(--clg-navy)", marginTop: 4 }}>
        {unit.number}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {condition === "down" && <Badge tone="critical">Down</Badge>}
        {condition === "check_engine" && <Badge tone="accent" title={faults?.activeDescription || faults?.activeCode}>Check engine</Badge>}
        {maint && <Badge tone={maint.tone}>{maint.label}</Badge>}
      </div>

      <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginTop: 12, lineHeight: 1.55 }}>
        {openOrder
          ? [openOrder.complaint || openOrder.description || openOrder.category, openOrder.vendor?.name ? `At ${openOrder.vendor.name}.` : null].filter(Boolean).join(" ")
          : "No open work right now."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)", fontSize: 12 }}>
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Domicile</div>
          <div style={{ color: "var(--clg-navy)", fontWeight: 600, marginTop: 2 }}>{unit.domicile || "—"}</div>
        </div>
        {!isTrailer && (
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Odometer</div>
            <div style={{ color: "var(--clg-navy)", fontWeight: 600, marginTop: 2 }}>{unit.odometer ? `${unit.odometer.toLocaleString()} mi` : "—"}</div>
          </div>
        )}
        {!isTrailer && (
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Last PM</div>
            <div style={{ color: "var(--clg-navy)", fontWeight: 600, marginTop: 2 }}>{unit.last_pm_date || "—"}</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Warranty</div>
          <div style={{ color: "var(--clg-navy)", fontWeight: 600, marginTop: 2 }}>{unit.warranty_status || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>Spend YTD</div>
          <div style={{ color: "var(--clg-navy)", fontWeight: 600, marginTop: 2 }}>{activity ? fmtMoney(activity.spendYtd) : "$0"}</div>
        </div>
      </div>

      {isTrailer && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--clg-text-muted)" }}>
          Trailers don't carry an odometer or PM interval in Alvys — not missing data, just not tracked for this equipment type.
        </div>
      )}

      <Button size="sm" fullWidth onClick={onOpenFull} style={{ marginTop: 14 }}>
        View full profile
      </Button>
      <button
        onClick={onToggleActive}
        style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "var(--clg-royal)", cursor: "pointer", fontSize: 11.5, textDecoration: "underline", padding: 0 }}
      >
        Mark {unit.is_active ? "inactive" : "active"}
      </button>
    </div>
  );
}

function UnitRow({ unit, activity, faults, selected, isTrailer, isMobile, onSelect }) {
  const condition = conditionFor(unit, faults);
  const flagBadge = condition === "down" ? <Badge tone="critical">Down</Badge>
    : condition === "check_engine" ? <Badge tone="accent" style={{ whiteSpace: "nowrap" }}>Check</Badge>
    : !unit.is_active ? <Badge tone="neutral">Inactive</Badge> : null;

  if (isMobile) {
    return (
      <div
        onClick={onSelect}
        style={{
          display: "flex", flexDirection: "column", gap: 4, padding: "12px 16px", cursor: "pointer",
          background: selected ? "var(--clg-surface-sunken)" : "transparent",
          boxShadow: selected ? "inset 3px 0 0 var(--clg-navy)" : "none",
          borderBottom: "1px solid var(--clg-border-subtle)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ConditionDot condition={condition} />
            <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, color: "var(--clg-navy)" }}>{unit.number}</span>
            {OWNERSHIP_BADGE[unit.ownership] && <Badge tone="brand">{OWNERSHIP_BADGE[unit.ownership]}</Badge>}
          </span>
          {flagBadge}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", paddingLeft: 15 }}>
          {isTrailer ? unit.vin || "—" : unit.current_location || "—"} · {fmtMoney(activity ? activity.spendYtd : 0)} YTD
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: isTrailer ? "20px minmax(140px,1fr) 200px 100px 96px" : "20px minmax(140px,1fr) 110px 90px 100px 96px",
        gap: 10, alignItems: "center", padding: "11px 16px", fontSize: 12.5, cursor: "pointer",
        background: selected ? "var(--clg-surface-sunken)" : "transparent",
        boxShadow: selected ? "inset 3px 0 0 var(--clg-navy)" : "none",
        borderBottom: "1px solid var(--clg-border-subtle)",
      }}
    >
      <ConditionDot condition={condition} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, color: "var(--clg-navy)" }}>{unit.number}</span>
          {OWNERSHIP_BADGE[unit.ownership] && <Badge tone="brand">{OWNERSHIP_BADGE[unit.ownership]}</Badge>}
        </div>
        <div style={{ fontSize: 11, color: "var(--clg-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isTrailer ? unit.vin || "—" : unit.current_location || "—"}
        </div>
      </div>
      {!isTrailer && <div style={{ color: "var(--clg-text-body)" }}>{unit.odometer ? `${unit.odometer.toLocaleString()} mi` : "—"}</div>}
      {!isTrailer && <div style={{ color: "var(--clg-text-body)" }}>{unit.last_pm_date || "—"}</div>}
      <div style={{ color: "var(--clg-text-body)" }}>{activity ? fmtMoney(activity.spendYtd) : "$0"}</div>
      <div>{flagBadge}</div>
    </div>
  );
}

export default function UnitsView({ canViewAssetLifecycle }) {
  const { units, loading, error, reload, toggleActive } = useUnits();
  const { byUnitId, loading: activityLoading } = useUnitActivity();
  const { byUnitId: faultsByUnitId } = useUnitFaults();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const [typeTab, setTypeTab] = useState("Truck");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [openUnitId, setOpenUnitId] = useState(null);
  const isMobile = useIsMobile();

  const visible = useMemo(() => {
    const rows = units
      .filter((u) => statusFilter === "all" || (statusFilter === "active" ? u.is_active : !u.is_active))
      .filter((u) => (typeTab === "Truck" ? u.type !== "Trailer" : u.type === "Trailer"))
      .filter((u) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return [u.number, u.vin, u.current_location, u.plate_number].filter(Boolean).some((v) => v.toLowerCase().includes(q));
      });
    // Attention first (down, then check-engine), then by YTD spend --
    // never unit-number order, which buries every real problem behind
    // whichever unit happens to sort first alphabetically.
    return rows.sort((a, b) => {
      const rank = (u) => {
        const c = conditionFor(u, faultsByUnitId[u.id]);
        return c === "down" ? 0 : c === "check_engine" ? 1 : 2;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return (byUnitId[b.id]?.spendYtd ?? 0) - (byUnitId[a.id]?.spendYtd ?? 0);
    });
  }, [units, statusFilter, typeTab, query, faultsByUnitId, byUnitId]);

  const truckCount = units.filter((u) => u.type !== "Trailer" && u.is_active).length;
  const trailerCount = units.filter((u) => u.type === "Trailer" && u.is_active).length;
  const downCount = units.filter((u) => u.is_active && u.can_move_load === false).length;
  const checkEngineCount = units.filter((u) => u.is_active && faultsByUnitId[u.id]?.activeSeverity).length;
  const inServiceCount = units.filter((u) => u.is_active).length - downCount;
  const leasedCount = units.filter((u) => u.is_active && u.ownership !== "owned").length;

  const selectedUnit = visible.find((u) => u.id === selectedId) || visible[0] || null;

  if (openUnitId) {
    return (
      <UnitDetailPage
        unitId={openUnitId}
        onBack={() => setOpenUnitId(null)}
        canViewAssetLifecycle={canViewAssetLifecycle}
      />
    );
  }

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Units</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>{truckCount + trailerCount} active units</h2>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", width: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--clg-cool)" }} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Unit, VIN, plate…" style={{ paddingLeft: 30 }} />
          </div>
          <Button size="sm" iconLeft={<Plus size={16} />} onClick={() => setShowForm(true)}>New unit</Button>
        </div>
      </div>

      {showForm && <UnitForm onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload(); }} />}
      {error && <Alert tone="critical" title="Couldn't load units" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Down", value: downCount, warn: true },
          { label: "Check engine", value: checkEngineCount, warn: true },
          { label: "In service", value: inServiceCount, warn: false },
          { label: "Leased (Penske/Hale)", value: leasedCount, warn: false },
        ].map((t) => (
          <div key={t.label} style={{
            background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)",
            padding: "14px 16px", borderTop: t.warn && t.value > 0 ? "3px solid var(--clg-scarlet)" : undefined,
          }}>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: t.warn && t.value > 0 ? "var(--clg-ruby)" : "var(--clg-navy)" }}>{t.value}</div>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "inline-flex", background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-md)", padding: 3, gap: 2 }}>
          {[{ key: "Truck", label: `Trucks (${truckCount})` }, { key: "Trailer", label: `Trailers (${trailerCount})` }].map((t) => (
            <button
              key={t.key}
              onClick={() => { setTypeTab(t.key); setSelectedId(null); }}
              style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 700, fontFamily: "var(--clg-font-heading)", borderRadius: "var(--clg-radius-sm)",
                border: "none", cursor: "pointer",
                background: typeTab === t.key ? "var(--clg-navy)" : "transparent",
                color: typeTab === t.key ? "#fff" : "var(--clg-pewter)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["active", "inactive", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{
                padding: "6px 12px", fontSize: 11.5, textTransform: "capitalize", cursor: "pointer", borderRadius: "var(--clg-radius-sm)",
                border: "1px solid " + (statusFilter === f ? "var(--clg-royal)" : "var(--clg-border-default)"),
                background: statusFilter === f ? "var(--clg-royal)" : "#fff",
                color: statusFilter === f ? "#fff" : "var(--clg-pewter)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading || activityLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading units…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          No units match.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: 16, alignItems: "start" }}>
          <div style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", overflow: "hidden" }}>
            {!isMobile && (
              <div style={{
                display: "grid",
                gridTemplateColumns: typeTab === "Trailer" ? "20px minmax(140px,1fr) 200px 100px 96px" : "20px minmax(140px,1fr) 110px 90px 100px 96px",
                gap: 10, padding: "10px 16px", background: "var(--clg-surface-subtle)",
                fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)",
              }}>
                <span />
                <span>Unit</span>
                {typeTab === "Trailer" ? <span>VIN</span> : <><span>Odometer</span><span>Last PM</span></>}
                <span>Spend YTD</span>
                <span>Flag</span>
              </div>
            )}
            {visible.map((u) => (
              <UnitRow
                key={u.id} unit={u} activity={byUnitId[u.id]} faults={faultsByUnitId[u.id]}
                selected={(selectedUnit?.id ?? visible[0]?.id) === u.id}
                isTrailer={typeTab === "Trailer"}
                isMobile={isMobile}
                onSelect={() => setSelectedId(u.id)}
              />
            ))}
          </div>

          {selectedUnit && (
            <UnitPanel
              unit={selectedUnit} activity={byUnitId[selectedUnit.id]} faults={faultsByUnitId[selectedUnit.id]}
              isMobile={isMobile}
              onOpenFull={() => setOpenUnitId(selectedUnit.id)}
              onToggleActive={() => toggleActive(selectedUnit.id, !selectedUnit.is_active)}
            />
          )}
        </div>
      )}

    </div>
  );
}
