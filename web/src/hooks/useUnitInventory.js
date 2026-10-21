import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { COMMON_INVENTORY_ITEMS } from "../lib/unitInventoryItems";

const SELECT = "id, unit_id, item_name, status, notes, created_at, updated_at";

export function useUnitInventory(unitId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!unitId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("unit_inventory_items").select(SELECT)
      .eq("unit_id", unitId).order("item_name", { ascending: true });
    if (err) { setError(err.message); setItems([]); } else { setItems(data ?? []); }
    setLoading(false);
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const addItem = async (itemName) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("unit_inventory_items").insert({
      unit_id: unitId, item_name: itemName.trim(), updated_by: user?.id ?? null,
    });
    if (err) return err.message;
    await load();
    return null;
  };

  // Seeds whichever common items aren't already on this unit's list --
  // never duplicates one that's already there (by name, case-insensitive).
  const addCommonItems = async () => {
    const existing = new Set(items.map((i) => i.item_name.trim().toLowerCase()));
    const toAdd = COMMON_INVENTORY_ITEMS.filter((name) => !existing.has(name.toLowerCase()));
    if (toAdd.length === 0) return null;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("unit_inventory_items").insert(
      toAdd.map((item_name) => ({ unit_id: unitId, item_name, updated_by: user?.id ?? null })),
    );
    if (err) return err.message;
    await load();
    return null;
  };

  const setStatus = async (itemId, status) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status } : i)));
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("unit_inventory_items")
      .update({ status, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", itemId);
    if (err) { await load(); return err.message; }
    return null;
  };

  const setNotes = async (itemId, notes) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("unit_inventory_items")
      .update({ notes: notes.trim() || null, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", itemId);
    if (err) return err.message;
    await load();
    return null;
  };

  const deleteItem = async (itemId) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    const { error: err } = await supabase.from("unit_inventory_items").delete().eq("id", itemId);
    if (err) { await load(); return err.message; }
    return null;
  };

  return { items, loading, error, reload: load, addItem, addCommonItems, setStatus, setNotes, deleteItem };
}
