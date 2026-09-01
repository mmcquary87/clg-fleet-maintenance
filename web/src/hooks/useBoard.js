import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const LANES = ["waiting_on_you", "waiting_on_vendor", "waiting_on_parts", "in_the_bay"];

function laneFor(wo) {
  if (wo.approval_status === "needs_approval") return "waiting_on_you";
  if (wo.waiting_on_parts) return "waiting_on_parts";
  if (wo.assigned_bay && wo.status === "In Progress") return "in_the_bay";
  if (wo.vendor_id) return "waiting_on_vendor";
  return "waiting_on_you";
}

function idleHours(unit, wo) {
  const since = unit.idle_since || wo.date_opened;
  if (!since) return 0;
  return Math.max(0, (Date.now() - new Date(since).getTime()) / 36e5);
}

export function useBoard() {
  const [units, setUnits] = useState([]);
  const [closedToday, setClosedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = new Date().toISOString().slice(0, 10);
    const { count } = await supabase
      .from("work_orders")
      .select("unit_id", { count: "exact", head: true })
      .eq("status", "Closed")
      .eq("voided", false)
      .eq("date_closed", today);
    setClosedToday(count ?? 0);

    const { data, error: err } = await supabase
      .from("work_orders")
      .select(
        "id, category, severity, system_component, complaint, description, cost, status, " +
        "date_opened, promised_back, approval_status, assigned_bay, assigned_tech, " +
        "waiting_on_parts, parts_eta, " +
        "unit:units(id, number, hourly_revenue_rate, idle_since, can_move_load, current_location, driver_name, is_active), " +
        "vendor:vendors(id, name)"
      )
      .neq("status", "Closed")
      .eq("voided", false)
      .order("date_opened", { ascending: true });

    if (err) {
      setError(err.message);
      setUnits([]);
      setLoading(false);
      return;
    }

    // One card per unit — if a unit has multiple open work orders, the
    // oldest (first, since we sorted ascending) is the lead issue shown.
    const byUnit = new Map();
    (data ?? []).forEach((wo) => {
      if (!wo.unit || wo.unit.is_active === false) return;
      if (!byUnit.has(wo.unit.id)) {
        byUnit.set(wo.unit.id, { unit: wo.unit, lead: wo, openCount: 1 });
      } else {
        byUnit.get(wo.unit.id).openCount += 1;
      }
    });

    const cards = Array.from(byUnit.values()).map(({ unit, lead, openCount }) => {
      const hours = idleHours(unit, lead);
      const rate = Number(unit.hourly_revenue_rate) || 0;
      return {
        unit,
        wo: lead,
        openCount,
        lane: laneFor(lead),
        idleHours: hours,
        costOfWaiting: hours * rate,
        hourlyRate: rate,
      };
    });

    setUnits(cards);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = {
    idleCount: units.length,
    downCount: units.filter((c) => c.unit.can_move_load === false).length,
    costOfWaiting: units.reduce((s, c) => s + c.costOfWaiting, 0),
    burnRate: units.reduce((s, c) => s + c.hourlyRate, 0),
  };

  const lanes = Object.fromEntries(
    LANES.map((lane) => [lane, units.filter((c) => c.lane === lane).sort((a, b) => b.costOfWaiting - a.costOfWaiting)])
  );

  return { lanes, totals, closedToday, loading, error, reload: load };
}
