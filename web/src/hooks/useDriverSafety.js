import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const LOSS_CATEGORIES = [
  { key: "speeding", label: "Speeding", scoreKey: "speeding_score" },
  { key: "safety", label: "Safety events", scoreKey: "safety_score" },
  { key: "hos", label: "HOS violations", scoreKey: "hos_score" },
];

// overall_score is blanked for two different reasons (see
// driver_safety_scorecard_view.sql) but the view doesn't say which --
// inferred here the same way the table does: a driver with miles already
// cleared the "no driving data" case, so a blank score left over after
// that is the 14-day grace period.
function isInGrace(row) {
  return row.overall_score === null && row.miles_driven > 0;
}

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
  const graceDrivers = scorecards.filter(isInGrace);

  // Rank = 1 + count of scored drivers with a strictly higher score, so
  // tied scores share a rank instead of being arbitrarily ordered.
  const ranked = scored
    .slice()
    .sort((a, b) => b.overall_score - a.overall_score)
    .map((row, _i, arr) => ({
      ...row,
      rank: 1 + arr.filter((other) => other.overall_score > row.overall_score).length,
    }));

  const totalMiles = scored.reduce((sum, d) => sum + (d.miles_driven || 0), 0);
  const totalEvents = scored.reduce((sum, d) => sum + (d.speeding_event_count || 0) + (d.safety_event_count || 0), 0);
  const eventsPer1kMiles = totalMiles > 0 ? totalEvents / (totalMiles / 1000) : null;

  // "Where the points go" -- each component score's shortfall from its own
  // 100-point ceiling, summed across scored drivers. A rough proxy for
  // "where the fleet is losing the most points" without the raw
  // penalty-point sums the view doesn't expose directly.
  let biggestLossCategory = null;
  let categoryBreakdown = [];
  if (scored.length > 0) {
    const deficits = LOSS_CATEGORIES.map((c) => ({
      ...c,
      deficit: scored.reduce((sum, d) => sum + (100 - (d[c.scoreKey] ?? 100)), 0),
    }));
    biggestLossCategory = deficits.reduce((a, b) => (b.deficit > a.deficit ? b : a)).label;
    const totalDeficit = deficits.reduce((sum, c) => sum + c.deficit, 0);
    categoryBreakdown = deficits.map((c) => ({
      label: c.label,
      deficit: c.deficit,
      share: totalDeficit > 0 ? c.deficit / totalDeficit : 0,
    }));
  }

  const totals = {
    driverCount: scorecards.length,
    scoredCount: scored.length,
    fleetAverage: scorecards[0]?.fleet_average_score ?? null,
    greenCount: scorecards.filter((d) => d.score_band === "green").length,
    yellowCount: scorecards.filter((d) => d.score_band === "yellow").length,
    redCount: scorecards.filter((d) => d.score_band === "red").length,
    graceCount: graceDrivers.length,
    eventsPer1kMiles,
    totalEvents,
    totalMiles,
    biggestLossCategory,
    categoryBreakdown,
  };

  return { scorecards, ranked, graceDrivers, totals, loading, error, reload: load };
}
