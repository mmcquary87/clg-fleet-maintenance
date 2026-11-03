import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Trailing window, not the whole history -- a trip's notes are only ever
// useful while it's still an active/recent load, and this avoids the table
// growing unbounded in what gets pulled on every Tracking page load.
const WINDOW_DAYS = 30;

// Powers the Tracking page's per-trip dispatcher notes: fetched once for
// every trip instead of one query per row. Keyed by alvys_trip_id, newest
// first, since that's the stable id a note stays attached to even after
// the trip itself drops out of driver_active_trips/unit_current_trip.
export function useTripNotes() {
  const [notesByTripId, setNotesByTripId] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const { data, error: err } = await supabase
      .from("trip_notes")
      .select("id, alvys_trip_id, load_number, status, note, created_by, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
      setNotesByTripId(new Map());
      setLoading(false);
      return;
    }

    const byTrip = new Map();
    for (const row of data ?? []) {
      const list = byTrip.get(row.alvys_trip_id) ?? [];
      list.push(row);
      byTrip.set(row.alvys_trip_id, list);
    }
    setNotesByTripId(byTrip);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async ({ alvysTripId, loadNumber, status, note, createdBy }) => {
    const { error: err } = await supabase.from("trip_notes").insert({
      alvys_trip_id: alvysTripId,
      load_number: loadNumber ?? null,
      status: status || null,
      note: note?.trim() || null,
      created_by: createdBy,
    });
    if (err) throw err;
    await load();
  };

  const notesFor = (alvysTripId) => notesByTripId.get(alvysTripId) ?? [];
  const latestStatusFor = (alvysTripId) => notesFor(alvysTripId).find((n) => n.status)?.status ?? null;

  return { notesByTripId, notesFor, latestStatusFor, loading, error, addNote, reload: load };
}
