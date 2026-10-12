import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Save, Check } from "lucide-react";
import { Button, Input, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";

function defaultsFor(u) {
  // Same "no last-PM-odometer on file yet -> assume serviced as of today"
  // prefill as the per-unit Maintenance schedule editor (unitDetailShared.jsx)
  // so a truck touched there and one touched here land on the same baseline.
  return {
    lastOdometer: u.last_pm_odometer ?? u.odometer ?? "",
    intervalMiles: u.pm_interval_miles ?? "",
  };
}

// Setting Debbie's per-make PM intervals (Freightliner/Volvo/Mack, 2026-10-12)
// one truck at a time in the unit detail panel is an hour of clicking --
// this lists every active truck in one table, with an "apply to all shown"
// shortcut for setting one interval across a whole make at once, then a
// single save for whatever actually changed.
export default function BulkPmIntervalEditor({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [edits, setEdits] = useState({});
  const [query, setQuery] = useState("");
  const [bulkInterval, setBulkInterval] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    supabase.from("units")
      .select("id, number, make, model, odometer, last_pm_odometer, pm_interval_miles")
      .eq("type", "Truck").eq("is_active", true)
      .order("make", { ascending: true })
      .order("number", { ascending: true })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setRows([]); } else { setRows(data ?? []); }
        setLoading(false);
      });
  };

  useEffect(load, []);

  // Seed edits from each row's own default once it's loaded -- never
  // stomps an edit already in progress on a reload.
  useEffect(() => {
    if (rows.length === 0) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of rows) {
        if (!(u.id in next)) next[u.id] = defaultsFor(u);
      }
      return next;
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => [u.number, u.make, u.model].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
  }, [rows, query]);

  const setField = (id, key, value) => {
    setSavedAt(null);
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const applyBulkInterval = () => {
    if (bulkInterval === "") return;
    setSavedAt(null);
    setEdits((prev) => {
      const next = { ...prev };
      for (const u of filtered) next[u.id] = { ...next[u.id], intervalMiles: bulkInterval };
      return next;
    });
  };

  const isDirty = (u) => {
    const d = defaultsFor(u);
    const e = edits[u.id] ?? d;
    return String(e.lastOdometer) !== String(d.lastOdometer) || String(e.intervalMiles) !== String(d.intervalMiles);
  };

  const dirtyRows = rows.filter(isDirty);

  const saveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const u of dirtyRows) {
        const f = edits[u.id];
        const { error: err } = await supabase.from("units").update({
          last_pm_odometer: f.lastOdometer === "" ? null : Number(f.lastOdometer),
          pm_interval_miles: f.intervalMiles === "" ? null : Number(f.intervalMiles),
        }).eq("id", u.id);
        if (err) throw err;
      }
      setSavedAt(dirtyRows.length);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, .5)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", width: "100%", maxWidth: 820,
          boxShadow: "var(--clg-shadow-lg, 0 12px 40px rgba(0,0,0,.25))",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--clg-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 18, color: "var(--clg-navy)" }}>
              Bulk edit PM intervals
            </div>
            <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 4 }}>
              Every active truck, one place to set mileage intervals instead of per-unit.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          {error && <Alert tone="critical" title="Couldn't save" style={{ marginBottom: 12 }}>{error}</Alert>}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Filter by unit #, make, or model</div>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Freightliner" />
            </div>
            <div style={{ width: 160 }}>
              <div style={{ fontSize: 10, color: "var(--clg-text-muted)", marginBottom: 3 }}>Set interval (mi)</div>
              <Input type="number" min="1" value={bulkInterval} onChange={(e) => setBulkInterval(e.target.value)} placeholder="e.g. 25000" />
            </div>
            <Button variant="outline" size="sm" onClick={applyBulkInterval} disabled={bulkInterval === "" || filtered.length === 0}>
              Apply to {filtered.length} shown
            </Button>
          </div>
        </div>

        <div style={{ padding: "0 24px 20px", maxHeight: 440, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "30px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
              <Loader2 size={16} className="spin" /> Loading trucks…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
              No trucks match.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Unit", "Make / Model", "Odometer", "Last PM odometer", "Interval (mi)"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "8px 8px", fontFamily: "var(--clg-font-heading)", fontSize: 10,
                      fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-text-muted)",
                      borderBottom: "2px solid var(--clg-border-default)", position: "sticky", top: 0, background: "var(--clg-surface-card)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const f = edits[u.id] ?? defaultsFor(u);
                  const dirty = isDirty(u);
                  return (
                    <tr key={u.id} style={{ background: dirty ? "var(--clg-surface-subtle)" : "transparent" }}>
                      <td style={{ padding: "6px 8px", fontFamily: "var(--clg-font-mono, monospace)", fontWeight: 700, color: "var(--clg-navy)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        {u.number}
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--clg-text-body)", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        {[u.make, u.model].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--clg-text-muted)", borderBottom: "1px solid var(--clg-border-subtle)", whiteSpace: "nowrap" }}>
                        {u.odometer ? `${u.odometer.toLocaleString()} mi` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        <Input type="number" min="0" value={f.lastOdometer} onChange={(e) => setField(u.id, "lastOdometer", e.target.value)} style={{ fontSize: 12.5, padding: "5px 8px" }} />
                      </td>
                      <td style={{ padding: "6px 8px", borderBottom: "1px solid var(--clg-border-subtle)" }}>
                        <Input type="number" min="1" value={f.intervalMiles} onChange={(e) => setField(u.id, "intervalMiles", e.target.value)} placeholder="e.g. 25000" style={{ fontSize: 12.5, padding: "5px 8px" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--clg-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>
            {savedAt != null
              ? <span style={{ color: "var(--clg-royal)", display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> Saved {savedAt} unit{savedAt === 1 ? "" : "s"}.</span>
              : `${dirtyRows.length} unsaved change${dirtyRows.length === 1 ? "" : "s"}`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" onClick={saveAll} disabled={dirtyRows.length === 0 || saving} iconLeft={saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}>
              {saving ? "Saving…" : `Save ${dirtyRows.length > 0 ? dirtyRows.length : ""} changed`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
