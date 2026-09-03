import { useMemo, useState } from "react";
import { Wrench, ChevronLeft, Plus, Trash2, Loader2, Search } from "lucide-react";
import { Button, Input, Badge, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { CATEGORIES } from "../../lib/categories";
import { useMechanicQueue } from "../../hooks/useMechanicQueue";
import { useWorkOrder } from "../../hooks/useWorkOrder";
import EmptyState from "../EmptyState";

const fieldLabelStyle = { fontSize: 13, fontWeight: 700, color: "var(--clg-navy)", marginBottom: 6 };
const backButtonStyle = {
  display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
  color: "var(--clg-royal)", fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 16,
};

function severityTone(s) {
  if (s === "Unit down") return "critical";
  if (s === "Urgent") return "accent";
  return "neutral";
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyPartRow() {
  return { id: uid(), part_name: "", quantity: "1" };
}

// Big, touch-first job list + repair log sheet for the shop mechanic to use
// directly from a tablet -- records the issue found, parts used, and labor
// time against an existing work order. Never sets status to Closed itself
// (see 20260901040000_mechanic_work_log.sql) -- only Open -> In Progress,
// since Closed drives Spend/Cost-per-mile reporting off the cost field,
// which a mechanic logging parts/hours from the shop floor doesn't set.
export default function MechanicView() {
  const { orders, loading, error, reload } = useMechanicQueue();
  const [selectedId, setSelectedId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      (o.unit?.number ?? "").toLowerCase().includes(q) ||
      (o.category ?? "").toLowerCase().includes(q) ||
      (o.complaint ?? "").toLowerCase().includes(q)
    );
  }, [orders, query]);

  if (creatingNew) {
    return (
      <NewJobForm
        onCancel={() => setCreatingNew(false)}
        onCreated={(id) => { setCreatingNew(false); setSelectedId(id); reload(); }}
      />
    );
  }

  if (selectedId) {
    return <RepairSheet workOrderId={selectedId} onBack={() => { setSelectedId(null); reload(); }} />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
        <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)" }}>
          Mechanic queue
        </div>
        <Button size="md" iconLeft={<Plus size={15} />} onClick={() => setCreatingNew(true)}>
          New job
        </Button>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--clg-text-muted)", marginBottom: 16 }}>
        Tap a job below to log what you found, the parts you used, and your time — or start a new one if it isn't on the board yet.
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--clg-text-muted)" }} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by unit number…"
          style={{ paddingLeft: 38, fontSize: 16, padding: "14px 14px 14px 38px" }}
        />
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40, color: "var(--clg-text-muted)" }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : error ? (
        <Alert tone="critical">{error}</Alert>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No open jobs"
          body={query ? "No jobs match that search." : "Every work order is closed or voided right now."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              style={{
                textAlign: "left", cursor: "pointer", border: "1px solid var(--clg-border-default)",
                borderRadius: "var(--clg-radius-md)", background: "#fff", padding: "16px 18px",
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 17, color: "var(--clg-navy)" }}>
                  Unit {o.unit?.number ?? "—"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {o.severity && <Badge tone={severityTone(o.severity)}>{o.severity}</Badge>}
                  <Badge tone="neutral">{o.status}</Badge>
                </div>
              </div>
              <div style={{ fontSize: 14, color: "var(--clg-text-body)", fontWeight: 600 }}>{o.category}</div>
              {o.complaint && <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>{o.complaint}</div>}
              {o.labor_hours != null && (
                <div style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>{o.labor_hours} hr logged so far</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RepairSheet({ workOrderId, onBack }) {
  const { order, loading, error, reload } = useWorkOrder(workOrderId);
  const [notes, setNotes] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [newParts, setNewParts] = useState([emptyPartRow()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [removingPartId, setRemovingPartId] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Seed the editable fields once the order loads. useWorkOrder starts out
  // with order === null, so this can't happen in useState's initializer --
  // adjusting state directly during render (guarded by seededFor) instead
  // of in an effect, per React's docs for state derived from a prop/id
  // change.
  const [seededFor, setSeededFor] = useState(null);
  if (order && seededFor !== order.id) {
    setNotes(order.description || order.complaint || "");
    setLaborHours(order.labor_hours != null ? String(order.labor_hours) : "");
    setSeededFor(order.id);
  }

  const setPartField = (id, k) => (e) => {
    setNewParts((rows) => rows.map((r) => (r.id === id ? { ...r, [k]: e.target.value } : r)));
  };
  const addPartRow = () => setNewParts((rows) => [...rows, emptyPartRow()]);
  const removeNewPartRow = (id) => setNewParts((rows) => rows.filter((r) => r.id !== id));

  const removeSavedPart = async (partId) => {
    setRemovingPartId(partId);
    try {
      await supabase.from("work_order_parts").delete().eq("id", partId);
      await reload();
    } finally {
      setRemovingPartId(null);
    }
  };

  // A real (hard) delete, not the office-facing void feature -- this is
  // for a job that shouldn't exist at all (mechanic started it by mistake,
  // wrong unit, duplicate), not a real job that needs to stay in the
  // record for spend history. work_order_parts rows cascade-delete with
  // it. Any authenticated user can already do this per work_orders' own
  // RLS policy (void is the one column with finer trigger-enforced
  // permissions, not deletion) -- the confirm step here is the only
  // safeguard, so it's here rather than skipped.
  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error: err } = await supabase.from("work_orders").delete().eq("id", order.id);
      if (err) throw err;
      onBack();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updates = { description: notes.trim() || null };
      if (laborHours.trim() !== "") updates.labor_hours = Number(laborHours);
      if (order.status === "Open") updates.status = "In Progress";

      const { error: updateErr } = await supabase.from("work_orders").update(updates).eq("id", order.id);
      if (updateErr) throw updateErr;

      const rowsToInsert = newParts
        .filter((p) => p.part_name.trim())
        .map((p) => ({
          work_order_id: order.id,
          part_name: p.part_name.trim(),
          quantity: Number(p.quantity) || 1,
        }));
      if (rowsToInsert.length > 0) {
        const { error: partsErr } = await supabase.from("work_order_parts").insert(rowsToInsert);
        if (partsErr) throw partsErr;
      }

      setNewParts([emptyPartRow()]);
      await reload();
      setSaved(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60, color: "var(--clg-text-muted)" }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        <Alert tone="critical">{error || "Work order not found."}</Alert>
        <Button variant="outline" size="lg" onClick={onBack} style={{ marginTop: 16 }}>Back to queue</Button>
      </div>
    );
  }

  const inputStyle = { fontSize: 16, padding: "14px" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...backButtonStyle, marginBottom: 0 }}>
          <ChevronLeft size={18} /> Back to queue
        </button>
        {!confirmingDelete && (
          <button
            onClick={() => { setConfirmingDelete(true); setDeleteError(null); }}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--clg-scarlet)", fontSize: 13, fontWeight: 600, padding: 0 }}
          >
            <Trash2 size={15} /> Delete job
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div style={{
          border: "1px solid var(--clg-scarlet)", borderRadius: "var(--clg-radius-md)", padding: 16,
          background: "var(--clg-surface-subtle)", marginBottom: 20,
        }}>
          <div style={{ fontSize: 13.5, color: "var(--clg-text-body)", marginBottom: 12 }}>
            Delete this job? This removes the work order and any parts logged on it — it can't be undone.
          </div>
          {deleteError && <div style={{ color: "var(--clg-scarlet)", fontSize: 12.5, marginBottom: 10 }}>{deleteError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="sm" onClick={confirmDelete} disabled={deleting}
              iconLeft={deleting ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
              style={{ background: "var(--clg-scarlet)", border: "1px solid var(--clg-scarlet)" }}
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)" }}>
        Unit {order.unit?.number ?? "—"} · {order.category}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {order.severity && <Badge tone={severityTone(order.severity)}>{order.severity}</Badge>}
        <Badge tone="neutral">{order.status}</Badge>
      </div>
      {order.complaint && (
        <div style={{
          fontSize: 14, color: "var(--clg-text-body)", marginTop: 14, padding: "10px 12px",
          background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)",
        }}>
          <strong>Reported issue:</strong> {order.complaint}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--clg-navy)", marginBottom: 6 }}>What did you find / fix?</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="e.g. Replaced worn brake pads front axle, bled brake lines"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 16, fontFamily: "var(--clg-font-body)",
            color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
            borderRadius: "var(--clg-radius-sm)", padding: 14, resize: "vertical",
          }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--clg-navy)", marginBottom: 6 }}>Parts used</div>

        {order.parts?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {order.parts.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
                  background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)",
                }}
              >
                <div style={{ fontSize: 14, color: "var(--clg-text-body)" }}>
                  {p.part_name} <span style={{ color: "var(--clg-text-muted)" }}>× {p.quantity}</span>
                </div>
                <button
                  onClick={() => removeSavedPart(p.id)}
                  disabled={removingPartId === p.id}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", padding: 6, display: "inline-flex" }}
                >
                  {removingPartId === p.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {newParts.map((p) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 8 }}>
              <Input value={p.part_name} onChange={setPartField(p.id, "part_name")} placeholder="Part name" style={inputStyle} />
              <Input type="number" min="0" step="1" value={p.quantity} onChange={setPartField(p.id, "quantity")} placeholder="Qty" style={inputStyle} />
              <button
                onClick={() => removeNewPartRow(p.id)}
                disabled={newParts.length === 1}
                style={{
                  background: "none", border: "none", padding: 6,
                  cursor: newParts.length === 1 ? "not-allowed" : "pointer",
                  color: "var(--clg-text-muted)", opacity: newParts.length === 1 ? 0.35 : 1,
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <Button variant="quiet" size="sm" iconLeft={<Plus size={14} />} onClick={addPartRow} style={{ marginTop: 8 }}>
          Add another part
        </Button>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--clg-navy)", marginBottom: 6 }}>Your time on this repair (hours)</div>
        <Input
          type="number" min="0" step="0.25"
          value={laborHours}
          onChange={(e) => setLaborHours(e.target.value)}
          placeholder="e.g. 1.5"
          style={{ ...inputStyle, maxWidth: 160 }}
        />
      </div>

      {saveError && <div style={{ color: "var(--clg-scarlet)", fontSize: 13, marginTop: 16 }}>{saveError}</div>}
      {saved && !saveError && <div style={{ color: "var(--clg-royal)", fontSize: 13, marginTop: 16, fontWeight: 600 }}>Saved.</div>}

      <Button
        size="lg" onClick={save} disabled={saving}
        style={{ marginTop: 20, width: "100%", fontSize: 16, padding: "16px" }}
        iconLeft={saving ? <Loader2 size={16} className="spin" /> : null}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 10, textAlign: "center" }}>
        This moves the job to "In Progress" but doesn't close it out — the office closes it with final cost and invoice info.
      </div>
    </div>
  );
}

function emptyNewJob() {
  return { unitNumber: "", unitId: null, unitNotFound: false, newUnitType: "Truck", category: CATEGORIES[0], complaint: "" };
}

// Lets the mechanic start a job that isn't already on dispatch's board --
// e.g. something he notices himself mid-repair. Deliberately minimal
// (unit + category + problem only, no severity/routing/vendor questions --
// see IntakeWizard for the full dispatcher-facing version of those) since
// he's about to work the job immediately: status goes straight to "In
// Progress," and he lands in the same parts/time sheet as RepairSheet
// right after creating it.
function NewJobForm({ onCreated, onCancel }) {
  const [data, setData] = useState(emptyNewJob());
  const [looking, setLooking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const lookupUnit = async () => {
    const number = data.unitNumber.trim();
    if (!number) return;
    setLooking(true);
    setError(null);
    const { data: existing } = await supabase.from("units").select("id, number").ilike("number", number).maybeSingle();
    setData((d) => (existing
      ? { ...d, unitId: existing.id, unitNotFound: false }
      : { ...d, unitId: null, unitNotFound: true }));
    setLooking(false);
  };

  const createUnitAndUse = async () => {
    setLooking(true);
    setError(null);
    try {
      const { data: created, error: err } = await supabase.from("units")
        .insert({ number: data.unitNumber.trim(), type: data.newUnitType })
        .select("id, number").single();
      if (err) throw err;
      setData((d) => ({ ...d, unitId: created.id, unitNotFound: false }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLooking(false);
    }
  };

  const submit = async () => {
    if (!data.unitId || !data.complaint.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { data: created, error: err } = await supabase.from("work_orders").insert({
        unit_id: data.unitId,
        category: data.category,
        complaint: data.complaint.trim(),
        severity: "Routine",
        status: "In Progress",
        intake_source: "manual",
        source: "manual",
        date_opened: new Date().toISOString().slice(0, 10),
      }).select("id").single();
      if (err) throw err;
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const inputStyle = { fontSize: 16, padding: "14px" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" }}>
      <button onClick={onCancel} style={backButtonStyle}>
        <ChevronLeft size={18} /> Back to queue
      </button>

      <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 22, color: "var(--clg-navy)", marginBottom: 20 }}>
        New job
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={fieldLabelStyle}>Unit number</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            value={data.unitNumber}
            onChange={(e) => setData((d) => ({ ...d, unitNumber: e.target.value, unitId: null, unitNotFound: false }))}
            onKeyDown={(e) => e.key === "Enter" && lookupUnit()}
            placeholder="e.g. 3303"
            style={inputStyle}
          />
          <Button size="lg" variant="secondary" onClick={lookupUnit} disabled={looking || !data.unitNumber.trim()}>
            {looking ? <Loader2 size={16} className="spin" /> : "Find"}
          </Button>
        </div>
        {data.unitId && <div style={{ fontSize: 13, color: "var(--clg-royal)", marginTop: 8, fontWeight: 600 }}>Unit found ✓</div>}
        {data.unitNotFound && (
          <div style={{ marginTop: 10, padding: 12, background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
            <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginBottom: 8 }}>No unit {data.unitNumber} on file — add it?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={data.newUnitType}
                onChange={(e) => setData((d) => ({ ...d, newUnitType: e.target.value }))}
                style={{ padding: "10px 12px", fontSize: 15, border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)" }}
              >
                <option>Truck</option>
                <option>Trailer</option>
              </select>
              <Button size="lg" onClick={createUnitAndUse} disabled={looking}>Create unit {data.unitNumber}</Button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={fieldLabelStyle}>Category</div>
        <select
          value={data.category}
          onChange={(e) => setData((d) => ({ ...d, category: e.target.value }))}
          style={{
            width: "100%", boxSizing: "border-box", padding: 14, fontSize: 16,
            border: "1px solid var(--clg-border-default)", borderRadius: "var(--clg-radius-sm)", background: "#fff",
          }}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={fieldLabelStyle}>What's the problem?</div>
        <textarea
          value={data.complaint}
          onChange={(e) => setData((d) => ({ ...d, complaint: e.target.value }))}
          rows={4}
          placeholder="e.g. Check engine light, code P0299 turbo underboost"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 16, fontFamily: "var(--clg-font-body)",
            color: "var(--clg-text-body)", background: "var(--clg-surface-page)", border: "1px solid var(--clg-border-default)",
            borderRadius: "var(--clg-radius-sm)", padding: 14, resize: "vertical",
          }}
        />
      </div>

      {error && <div style={{ color: "var(--clg-scarlet)", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <Button
        size="lg" onClick={submit} disabled={creating || !data.unitId || !data.complaint.trim()}
        style={{ width: "100%", fontSize: 16, padding: "16px" }}
        iconLeft={creating ? <Loader2 size={16} className="spin" /> : null}
      >
        {creating ? "Creating…" : "Start job — log parts & time"}
      </Button>
    </div>
  );
}
