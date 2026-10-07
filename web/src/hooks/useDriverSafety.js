import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useDriverSafety() {
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("driver_safety_scorecard")
      .select("*")
      .order("overall_score", { ascending: false, nullsFirst: false });

    if (err) {
      setError(err.message);
      setScorecards([]);
      setLoading(false);
      return;
    }

    setScorecards(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scored = scorecards.filter((d) => d.overall_score !== null);
  const totals = {
    driverCount: scorecards.length,
    scoredCount: scored.length,
    fleetAverage: scorecards[0]?.fleet_average_score ?? null,
    greenCount: scorecards.filter((d) => d.score_band === "green").length,
    yellowCount: scorecards.filter((d) => d.score_band === "yellow").length,
    redCount: scorecards.filter((d) => d.score_band === "red").length,
  };

  return { scorecards, totals, loading, error, reload: load };
}
