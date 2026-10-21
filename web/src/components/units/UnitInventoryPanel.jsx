import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "../../ds";
import { useUnitInventory } from "../../hooks/useUnitInventory";

const STATUSES = [
  { value: "present", label: "Present", tone: "green" },
  { value: "damaged", label: "Damaged", tone: "yellow" },
  { value: "missing", label: "Missing", tone: "red" },
];

const TONE_STYLE = {
  green: { background: "#E3F3EA", color: "#1F7A4D" },
  yellow: { background: "#FBEED9", color: "#9A6B1E" },
  red: { background: "#FBE4E1", color: "var(--clg-ruby)" },
};

function StatusButtons({ value, onChange, disabled }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {STATUSES.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            disabled={disabled}
            style={{
              border: "none", cursor: disabled ? "default" : "pointer", borderRadius: "var(--clg-radius-pill)",
              padding: "4px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              ...(active ? TONE_STYLE[s.tone] : { background: "var(--clg-surface-subtle)", color: "var(--clg-text-muted)" }),
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function InventoryRow({ item, onSetStatus, onSetNotes, onDelete }) {
  const [notes, setNotes] = useState(item.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesDirty = notes.trim() !== (item.notes || "");

  const saveNotes = async () => {
    setSavingNotes(true);
    await onSetNotes(item.id, notes);
    setSavingNotes(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--clg-border-subtle)", borderRadius: "var(--clg-radius-sm)" }}>
      <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--clg-text-heading)" }}>
        {item.item_name}
      </div>
      <StatusButtons value={item.status} onChange={(status) => onSetStatus(item.id, status)} />
      <div style={{ flex: "1 1 200px", display: "flex", gap: 6 }}>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ fontSize: 12 }} />
        {notesDirty && (
          <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 size={12} className="spin" /> : "Save"}
          </Button>
        )}
      </div>
      <button
        onClick={() => onDelete(item.id)}
        title="Remove item"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)", padding: 4, flexShrink: 0 }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function UnitInventoryPanel({ unitId }) {
  const { items, loading, error, addItem, addCommonItems, setStatus, setNotes, deleteItem } = useUnitInventory(unitId);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [formError, setFormError] = useState(null);

  const submitNewItem = async () => {
    if (!newItem.trim()) return;
    setAdding(true);
    setFormError(null);
    const err = await addItem(newItem);
    setAdding(false);
    if (err) setFormError(err);
    else setNewItem("");
  };

  const seedCommon = async () => {
    setSeeding(true);
    setFormError(null);
    const err = await addCommonItems();
    setSeeding(false);
    if (err) setFormError(err);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 6, flex: "1 1 260px" }}>
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNewItem(); }}
            placeholder="Add an item (e.g. Spare fuses)"
          />
          <Button size="sm" iconLeft={adding ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} onClick={submitNewItem} disabled={adding || !newItem.trim()}>
            Add
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={seedCommon} disabled={seeding}>
          {seeding ? <Loader2 size={13} className="spin" /> : "Add common items"}
        </Button>
      </div>

      {(error || formError) && <div style={{ fontSize: 12, color: "var(--clg-scarlet)", marginBottom: 12 }}>{error || formError}</div>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20, color: "var(--clg-text-muted)" }}>
          <Loader2 size={16} className="spin" />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center", color: "var(--clg-text-muted)", fontSize: 13 }}>
          No inventory items on file for this unit yet — add one above or click "Add common items" to start from a typical list.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <InventoryRow key={item.id} item={item} onSetStatus={setStatus} onSetNotes={setNotes} onDelete={deleteItem} />
          ))}
        </div>
      )}
    </div>
  );
}
