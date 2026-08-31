import { useMemo, useState } from "react";
import { Plus, Loader2, Search } from "lucide-react";
import { Button, Badge, Eyebrow, Alert, Input } from "../../ds";
import { useUnits } from "../../hooks/useUnits";
import { useUnitActivity } from "../../hooks/useUnitActivity";
import { worstStatus } from "../../lib/maintenanceSchedule";
import UnitForm from "./UnitForm";
import UnitDrawer from "../shared/UnitDrawer";

function maintenanceTone(status) {
  if (status === "overdue") return "critical";
  if (status === "due_soon") return "accent";
  if (status === "ok") return "brand";
  return "neutral";
}

function maintenanceLabel(status) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "ok") return "On track";
  return "Not tracked";
}

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString();
}

function idleFor(idleSince) {
  const ms = Date.now() - new Date(idleSince).getTime();
  if (ms < 0) return null;
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return days > 0 ? `${days}d ${remHours}h` : `${hours}h`;
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 13, color: tone || "var(--clg-navy)", fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function UnitCard({ unit, activity, onOpen, onToggleActive }) {
  const status = worstStatus(unit);
  const isDown = unit.can_move_load === false;
  const openOrder = activity?.openOrder;
  const idle = unit.idle_since ? idleFor(unit.idle_since) : null;

  const sentence = openOrder
    ? [openOrder.complaint || openOrder.description || openOrder.category, openOrder.vendor?.name ? `At ${openOrder.vendor.name}.` : null]
        .filter(Boolean).join(" ")
    : "No open work right now.";

  return (
    <div
      onClick={onOpen}
      style={{ background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 22, cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 26, color: "var(--clg-navy)", letterSpacing: "-0.01em" }}>
          {unit.number}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {isDown && <Badge tone="critical">Down</Badge>}
          <Badge tone={maintenanceTone(status)}>{maintenanceLabel(status)}</Badge>
          {!unit.is_active && <Badge tone="neutral">Inactive</Badge>}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
        {[unit.type, unit.vin, unit.current_location].filter(Boolean).join(" · ") || "—"}
      </div>

      <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 12, lineHeight: 1.55 }}>
        {sentence}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--clg-border-subtle)" }}>
        <Stat label="Odometer" value={unit.odometer ? `${unit.odometer.toLocaleString()} mi` : "—"} />
        <Stat label="Last PM" value={unit.last_pm_date || "—"} />
        <Stat label="Spend YTD" value={activity ? fmtMoney(activity.spendYtd) : "$0"} />
        <Stat label="Idle" value={idle || "—"} tone={idle ? "var(--clg-scarlet)" : undefined} />
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--clg-border-subtle)" }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
          style={{ background: "none", border: "none", color: "var(--clg-royal)", cursor: "pointer", fontSize: 11.5, textDecoration: "underline", padding: 0 }}
        >
          Mark {unit.is_active ? "inactive" : "active"}
        </button>
      </div>
    </div>
  );
}

export default function UnitsView() {
  const { units, loading, error, reload, toggleActive } = useUnits();
  const { byUnitId, loading: activityLoading } = useUnitActivity();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [openUnitId, setOpenUnitId] = useState(null);

  const visible = useMemo(() => {
    return units
      .filter((u) => filter === "all" || (filter === "active" ? u.is_active : !u.is_active))
      .filter((u) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return [u.number, u.vin, u.current_location, u.type].filter(Boolean).some((v) => v.toLowerCase().includes(q));
      });
  }, [units, filter, query]);

  const downCount = visible.filter((u) => u.can_move_load === false).length;

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Units</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>
            {visible.length} unit{visible.length === 1 ? "" : "s"}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
            {downCount > 0 ? `${downCount} currently down, can't move a load.` : "None currently down."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", width: 240 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--clg-cool)" }} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Look up unit, VIN, location…" style={{ paddingLeft: 30 }} />
          </div>
          <Button size="sm" iconLeft={<Plus size={16} />} onClick={() => setShowForm(true)}>New unit</Button>
        </div>
      </div>

      {showForm && <UnitForm onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload(); }} />}

      {error && <Alert tone="critical" title="Couldn't load units" style={{ marginBottom: 16 }}>{error}</Alert>}

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {["active", "inactive", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "7px 13px", fontSize: 12, textTransform: "capitalize", cursor: "pointer",
              border: "1px solid " + (filter === f ? "var(--clg-royal)" : "var(--clg-reflection)"),
              background: filter === f ? "var(--clg-royal)" : "#fff",
              color: filter === f ? "#fff" : "var(--clg-pewter)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading || activityLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
          <Loader2 size={16} className="spin" /> Loading units…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13, background: "#fff", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)" }}>
          {units.length === 0 ? "No units yet. Units get created here or automatically from intake/work orders." : `No ${filter} units.`}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {visible.map((u) => (
            <UnitCard
              key={u.id} unit={u} activity={byUnitId[u.id]}
              onOpen={() => setOpenUnitId(u.id)}
              onToggleActive={() => toggleActive(u.id, !u.is_active)}
            />
          ))}
        </div>
      )}

      {openUnitId && <UnitDrawer unitId={openUnitId} onClose={() => setOpenUnitId(null)} />}
    </div>
  );
}
