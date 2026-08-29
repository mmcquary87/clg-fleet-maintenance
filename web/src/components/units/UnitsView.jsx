import { useMemo, useState } from "react";
import { Plus, Loader2, Search } from "lucide-react";
import { Button, Card, Badge, Eyebrow, Alert, Input } from "../../ds";
import { useUnits } from "../../hooks/useUnits";
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

export default function UnitsView() {
  const { units, loading, error, reload, toggleActive } = useUnits();
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

  return (
    <div style={{ padding: "28px", fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow tone="brand">Units</Eyebrow>
          <h2 style={{ fontSize: "var(--clg-size-h4)", fontWeight: 700, marginTop: 4 }}>Fleet roster</h2>
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

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
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

      <Card padding={0}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
            <Loader2 size={16} className="spin" /> Loading units…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
            {units.length === 0 ? "No units yet. Units get created here or automatically from intake/work orders." : `No ${filter} units.`}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)" }}>
            <thead>
              <tr>
                {["Unit", "Type", "VIN", "Location", "Maintenance", "Status", ""].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 16px", fontFamily: "var(--clg-font-heading)", fontSize: 11,
                    fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clg-text-brand)",
                    borderBottom: "2px solid var(--clg-border-default)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((u, i) => (
                <tr
                  key={u.id} onClick={() => setOpenUnitId(u.id)}
                  style={{ background: i % 2 ? "var(--clg-surface-subtle)" : "transparent", cursor: "pointer" }}
                >
                  <td style={{ padding: "11px 16px", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 600, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{u.number}</td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{u.type}</td>
                  <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{u.vin || "—"}</td>
                  <td style={{ padding: "11px 16px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)" }}>{u.current_location || "—"}</td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    <Badge tone={maintenanceTone(worstStatus(u))}>{maintenanceLabel(worstStatus(u))}</Badge>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    <Badge tone={u.is_active ? "brand" : "neutral"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleActive(u.id, !u.is_active); }}
                      style={{ background: "none", border: "none", color: "var(--clg-royal)", cursor: "pointer", fontSize: 11.5, textDecoration: "underline" }}
                    >
                      Mark {u.is_active ? "inactive" : "active"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {openUnitId && <UnitDrawer unitId={openUnitId} onClose={() => setOpenUnitId(null)} />}
    </div>
  );
}
