import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// "On time" = arrived by the end of the customer's committed window —
// the StopWindow end for FCFS stops, or the single AppointmentDate for
// APPT stops. This is a reasonable reading of the framework's "approved
// customer appointment window" language, not a CLG-approved exclusion
// rule — that's why these KPIs stay "Pending" on the dashboard even once
// real numbers are showing (see opsKpis.js).
function isOnTime(arrivedAt, windowEnd, appointmentAt) {
  if (!arrivedAt) return null;
  const deadline = windowEnd || appointmentAt;
  if (!deadline) return null;
  return new Date(arrivedAt).getTime() <= new Date(deadline).getTime();
}

// range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
export function useAlvysLoadsKpis(range) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!range?.start || !range?.end) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const startIso = new Date(range.start + "T00:00:00Z").toISOString();
    const endIso = new Date(range.end + "T23:59:59Z").toISOString();

    Promise.all([
      supabase.from("alvys_loads")
        .select("pickup_arrived_at, pickup_window_end, pickup_appointment_at")
        .gte("scheduled_pickup_at", startIso).lte("scheduled_pickup_at", endIso)
        .in("status", ["Delivered", "Completed"]),
      supabase.from("alvys_loads")
        .select("delivery_arrived_at, delivery_window_end, delivery_appointment_at")
        .gte("scheduled_delivery_at", startIso).lte("scheduled_delivery_at", endIso)
        .in("status", ["Delivered", "Completed"]),
      // Loaded miles for Empty Mile % needs to match the SAME basis as
      // Samsara's total-miles figure — actual miles driven during the
      // window — not "loads whose delivery happened to land in this
      // window" (that undercounts badly: a load driven mostly *this*
      // month but not yet marked Completed until early next month would
      // contribute all its driven miles to Samsara's total but none of
      // its loaded miles here). So: any Delivered/Completed load that
      // was actually picked up or delivered inside the window counts.
      supabase.from("alvys_loads")
        .select("loaded_miles")
        .in("status", ["Delivered", "Completed"])
        .or(`and(picked_up_at.gte.${startIso},picked_up_at.lte.${endIso}),and(delivered_at.gte.${startIso},delivered_at.lte.${endIso})`),
    ]).then(([pickupRes, deliveryRes, milesRes]) => {
      if (cancelled) return;
      if (pickupRes.error) { setError(pickupRes.error.message); setData(null); setLoading(false); return; }
      if (deliveryRes.error) { setError(deliveryRes.error.message); setData(null); setLoading(false); return; }
      if (milesRes.error) { setError(milesRes.error.message); setData(null); setLoading(false); return; }

      const pickupRows = pickupRes.data ?? [];
      const pickupOnTime = pickupRows
        .map((r) => isOnTime(r.pickup_arrived_at, r.pickup_window_end, r.pickup_appointment_at))
        .filter((v) => v !== null);

      const deliveryRows = deliveryRes.data ?? [];
      const deliveryOnTime = deliveryRows
        .map((r) => isOnTime(r.delivery_arrived_at, r.delivery_window_end, r.delivery_appointment_at))
        .filter((v) => v !== null);

      const loadedMiles = (milesRes.data ?? []).reduce((s, r) => s + (r.loaded_miles ? Number(r.loaded_miles) : 0), 0);

      setData({
        eligiblePickups: pickupOnTime.length,
        onTimePickupPct: pickupOnTime.length > 0 ? (pickupOnTime.filter(Boolean).length / pickupOnTime.length) * 100 : null,
        eligibleDeliveries: deliveryOnTime.length,
        onTimeDeliveryPct: deliveryOnTime.length > 0 ? (deliveryOnTime.filter(Boolean).length / deliveryOnTime.length) * 100 : null,
        loadedMiles,
      });
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [range?.start, range?.end]);

  return { data, loading, error };
}
