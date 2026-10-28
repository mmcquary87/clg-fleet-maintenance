import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Eyebrow, StatBlock, Table } from "../../ds";
import { useDriverSafety } from "../../hooks/useDriverSafety";
import { useFleetScoreHistory } from "../../hooks/useFleetScoreHistory";
import IncidentMap from "./IncidentMap";
import Dvir from "./Dvir";
import DriverPointBreakdown from "./DriverPointBreakdown";
import DateRangeFilter from "../DateRangeFilter";

// Same hues as StatusPill's TONES (not a new categorical palette) -- bars
// need the saturated text color, not the pale pill background, to read at
// a glance.
const BAR_FILL = { green: "#1F7A4D", yellow: "#9A6B1E", red: "var(--clg-ruby)" };
const BAND_LABEL = { green: "Above average", yellow: "Near average", red: "Below average" };
const BAND_FILTERS = ["all", "green", "yellow", "red"];
const CHART_HEIGHT = 200;
const TABLE_PAGE_SIZE = 10;

function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

function plural(n, singular, pluralForm = `${singular}s`) {
  return n === 1 ? singular : pluralForm;
}

function ledeSentence(totals) {
  if (totals.scoredCount === 0) return null;
  const parts = [];
  if (totals.redCount > 0) {
    parts.push(`${totals.redCount} ${plural(totals.redCount, "driver")} ${totals.redCount === 1 ? "is" : "are"} below average this period`);
  }
  if (totals.graceCount > 0) {
    parts.push(`${totals.graceCount} ${totals.graceCount === 1 ? "is" : "are"} in their grace period`);
  }
  let sentence = parts.length > 0
    ? parts.join(", and ").replace(/^(\d)/, "$1") + "."
    : "No drivers are below average this period.";
  // Capitalize if it starts with a number-led clause already built above.
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (totals.biggestLossCategory) {
    sentence += ` ${totals.biggestLossCategory} cost the fleet the most points.`;
  }
  return sentence;
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none", cursor: "pointer", borderRadius: "var(--clg-radius-pill)",
        padding: "6px 14px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        background: active ? "var(--clg-navy)" : "var(--clg-surface-subtle)",
        color: active ? "#fff" : "var(--clg-text-body)",
      }}
    >
      {children}
    </button>
  );
}

function RankingsBarChart({ ranked, fleetAverage }) {
  if (ranked.length === 0) return null;
  const byHighest = ranked.slice().sort((a, b) => b.overall_score - a.overall_score);

  return (
    <div style={{ position: "relative", padding: "28px 4px 0" }}>
      {fleetAverage !== null && (
        <div style={{
          position: "absolute", left: 4, right: 4, bottom: `${(fleetAverage / 100) * CHART_HEIGHT}px`,
          borderTop: "1px dashed var(--clg-border-strong)", zIndex: 1,
        }}>
          <span style={{
            position: "absolute", right: 0, top: -16, fontSize: 10.5, color: "var(--clg-text-muted)",
            background: "var(--clg-surface-card)", padding: "0 4px",
          }}>
            Fleet average {round1(fleetAverage)}
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: CHART_HEIGHT, overflowX: "auto" }}>
        {byHighest.map((d) => (
          <div key={d.driver_id} title={`${d.driver_name} — ${round1(d.overall_score)}`} style={{
            display: "flex", flexDirection: "column", alignItems: "center", flex: "1 0 26px", minWidth: 26, height: "100%",
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--clg-text-heading)", marginBottom: 2 }}>
              {round1(d.overall_score)}
            </div>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", height: `${d.overall_score}%`, minHeight: 2,
                background: BAR_FILL[d.score_band] || "var(--clg-cool)", borderRadius: "4px 4px 0 0",
              }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {byHighest.map((d) => (
          <div key={d.driver_id} style={{
            flex: "1 0 26px", minWidth: 26, fontSize: 9.5, color: "var(--clg-text-muted)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
          }}>
            {d.driver_name.split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}

function scoreCell(row) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: BAR_FILL[row.score_band] || "var(--clg-text-heading)" }}>
        {round1(row.overall_score)}
      </div>
      <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--clg-surface-subtle)", marginTop: 3 }}>
        <div style={{
          width: `${row.overall_score}%`, height: "100%", borderRadius: 2,
          background: BAR_FILL[row.score_band] || "var(--clg-cool)",
        }} />
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: "rank", label: "Rank", align: "right" },
  { key: "driverCell", label: "Driver" },
  { key: "scoreCell", label: "Score", align: "right" },
  { key: "speeding_score", label: "Speeding", align: "right" },
  { key: "safety_score", label: "Safety", align: "right" },
  { key: "hos_score", label: "HOS", align: "right" },
  { key: "milesCell", label: "Miles", align: "right" },
  { key: "eventsPer1k", label: "Events/1K mi", align: "right" },
];

// Cell keys hold formatted/JSX display values -- sorting needs the
// underlying raw numeric field instead (rank and scoreCell both rank by
// overall_score; milesCell/eventsPer1k sort by their un-formatted number).
const SORT_ACCESSORS = {
  rank: (r) => r.overall_score,
  driverCell: (r) => r.driver_name?.toLowerCase(),
  scoreCell: (r) => r.overall_score,
  speeding_score: (r) => r.speeding_score,
  safety_score: (r) => r.safety_score,
  hos_score: (r) => r.hos_score,
  milesCell: (r) => r.miles_driven,
  eventsPer1k: (r) => {
    const combined = (r.speeding_event_count || 0) + (r.safety_event_count || 0);
    return r.miles_driven > 0 ? combined / (r.miles_driven / 1000) : null;
  },
};

function sortRows(rows, sortBy, sortDir) {
  const accessor = SORT_ACCESSORS[sortBy] || SORT_ACCESSORS.scoreCell;
  return rows.slice().sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls/blanks sort last regardless of direction
    if (vb == null) return -1;
    if (typeof va === "string") {
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    }
    return sortDir === "asc" ? va - vb : vb - va;
  });
}

function RankingsTable({ ranked, range }) {
  const [bandFilter, setBandFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState("scoreCell");
  const [sortDir, setSortDir] = useState("asc"); // lowest first, matches the old fixed default
  const [breakdownRow, setBreakdownRow] = useState(null);

  const onSort = (key) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const filtered = ranked.filter((d) => bandFilter === "all" || d.score_band === bandFilter);

  const rows = sortRows(filtered, sortBy, sortDir).map((row) => {
    const combinedEvents = (row.speeding_event_count || 0) + (row.safety_event_count || 0);
    const eventsPer1k = row.miles_driven > 0 ? combinedEvents / (row.miles_driven / 1000) : null;
    return {
      ...row,
      driverCell: (
        <button
          onClick={() => setBreakdownRow(row)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "var(--clg-link)", fontWeight: 600, textAlign: "left" }}
        >
          {row.driver_name}
        </button>
      ),
      scoreCell: scoreCell(row),
      speeding_score: round1(row.speeding_score),
      safety_score: round1(row.safety_score),
      hos_score: round1(row.hos_score),
      milesCell: Math.round(row.miles_driven).toLocaleString(),
      eventsPer1k: eventsPer1k === null ? "—" : round1(eventsPer1k),
    };
  });

  const visible = showAll ? rows : rows.slice(0, TABLE_PAGE_SIZE);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow>Ranked · lowest score first · click a driver for their point breakdown</Eyebrow>
        <div style={{ display: "flex", gap: 6 }}>
          {BAND_FILTERS.map((b) => (
            <Chip key={b} active={bandFilter === b} onClick={() => setBandFilter(b)}>
              {b === "all" ? "All" : BAND_LABEL[b]}
            </Chip>
          ))}
        </div>
      </div>
      <Table columns={COLUMNS} rows={visible} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 4px", fontSize: 12, color: "var(--clg-text-muted)" }}>
        <span>Showing {visible.length} of {filtered.length} scored drivers · trailing 90 days</span>
        {filtered.length > TABLE_PAGE_SIZE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-link)", fontSize: 12, fontWeight: 600 }}
          >
            {showAll ? "Show fewer" : "Show all"}
          </button>
        )}
      </div>
      {breakdownRow && <DriverPointBreakdown row={breakdownRow} range={range} onClose={() => setBreakdownRow(null)} />}
    </div>
  );
}

function GraceAndScoring({ graceDrivers }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Eyebrow>In grace period</Eyebrow>
          <span style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>{graceDrivers.length} {plural(graceDrivers.length, "driver")}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 6, marginBottom: 12 }}>
          Scored for visibility but left out of the ranking and the fleet average until they clear Samsara's 14-day new-driver grace period.
        </div>
        {graceDrivers.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No drivers currently in grace.</div>
        ) : (
          graceDrivers.map((d) => (
            <div key={d.driver_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
              <span style={{ fontWeight: 600 }}>{d.driver_name}</span>
              <span style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>{Math.round(d.miles_driven).toLocaleString()} mi</span>
            </div>
          ))
        )}
      </div>

      <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 20 }}>
        <Eyebrow>How the score works</Eyebrow>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginTop: 8, lineHeight: 1.6 }}>
          Speed, Safety and HOS each start at 100 over a trailing 90-day window:
        </div>
        <ul style={{ fontSize: 12.5, color: "var(--clg-text-body)", lineHeight: 1.8, paddingLeft: 18, marginTop: 8 }}>
          <li><strong>Speeding</strong> decays exponentially with penalty points (moderate 0.25, heavy 0.75, severe 1.75 per interval).</li>
          <li><strong>Safety</strong> loses 5 points per weighted event (following distance 1.5, forward collision 1.75, crash 2.0, harsh brake/turn/rolling stop 0.75–1.0); dismissed events and dismissed speeding intervals don't count.</li>
          <li><strong>HOS</strong> loses 4 points per weighted violation (missed rest break 0.75, shift/cycle/duty limit 2.75 each, plus manually-logged Yard Move misuse 1.0 and Personal Conveyance misuse 0.75 — Samsara has no violation type for either, so Safety logs them directly). Missing Driver Certification/Shipping ID/Trailer Name don't count toward HOS.</li>
        </ul>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-body)", marginTop: 8, lineHeight: 1.6 }}>
          Overall = <code>100 × (average of the three / 100)^1.7</code>, capped at 100 — the curve rewards staying clean across
          all three more than excelling at one. A driver is colored green/yellow/red by points above or below the fleet
          average (±3), not an absolute cutoff.
        </div>
      </div>
    </div>
  );
}

function FleetTrendChart({ snapshots }) {
  const withScore = snapshots.filter((s) => s.fleet_average_score !== null);
  if (withScore.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>
        No history yet — a daily snapshot starts accumulating from today. Check back in a few days to see a real trend.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160 }}>
      {withScore.map((s, i) => {
        const isEdge = i === 0 || i === withScore.length - 1;
        return (
          <div
            key={s.id}
            title={`${s.snapshot_date} — ${round1(s.fleet_average_score)}`}
            style={{ flex: "1 0 10px", minWidth: 10, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--clg-text-heading)", marginBottom: 2, visibility: isEdge ? "visible" : "hidden" }}>
              {round1(s.fleet_average_score)}
            </div>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", height: `${s.fleet_average_score}%`, minHeight: 2, borderRadius: "3px 3px 0 0",
                background: i === withScore.length - 1 ? "var(--clg-navy)" : "var(--clg-mercury)",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WhereThePointsGo({ categoryBreakdown }) {
  if (categoryBreakdown.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No scored drivers yet.</div>;
  }
  const sorted = categoryBreakdown.slice().sort((a, b) => b.deficit - a.deficit);
  return (
    <div>
      {sorted.map((c) => (
        <div key={c.label} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span>{c.label}</span>
            <span style={{ fontWeight: 700, color: "var(--clg-text-heading)" }}>{Math.round(c.share * 100)}%</span>
          </div>
          <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--clg-surface-subtle)" }}>
            <div style={{ width: `${Math.max(c.share * 100, c.deficit > 0 ? 2 : 0)}%`, height: "100%", borderRadius: 4, background: "var(--clg-navy)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Trends({ snapshots, snapshotsLoading, changeSinceFirst, categoryBreakdown }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <Eyebrow>Fleet average, last {snapshots.length} day{snapshots.length === 1 ? "" : "s"}</Eyebrow>
          {changeSinceFirst !== null && (
            <span style={{ fontSize: 12.5, color: changeSinceFirst >= 0 ? "#1F7A4D" : "var(--clg-ruby)", fontWeight: 700 }}>
              {changeSinceFirst >= 0 ? "Up" : "Down"} {Math.abs(round1(changeSinceFirst))} point{Math.abs(round1(changeSinceFirst)) === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {snapshotsLoading ? (
          <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>Loading…</div>
        ) : (
          <FleetTrendChart snapshots={snapshots} />
        )}
      </div>
      <div>
        <Eyebrow style={{ marginBottom: 12 }}>Where the points go</Eyebrow>
        <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginBottom: 12 }}>
          Share of every point lost fleet-wide this window, by category.
        </div>
        <WhereThePointsGo categoryBreakdown={categoryBreakdown} />
      </div>
    </div>
  );
}

const TABS = [
  { id: "rankings", label: "Rankings" },
  { id: "map", label: "Incident map" },
  { id: "trends", label: "Trends" },
  { id: "dvir", label: "DVIR" },
  { id: "grace", label: "Grace & scoring" },
];

export default function DriverSafetyView() {
  const [range, setRange] = useState(null);
  const { scorecards, ranked, graceDrivers, totals, loading, error } = useDriverSafety(range);
  const { snapshots, changeSinceFirst, loading: snapshotsLoading } = useFleetScoreHistory();
  const [tab, setTab] = useState("rankings");

  // Only the very first load (no data at all yet) replaces the page with a
  // bare spinner. A range change also sets `loading` true, but scorecards
  // from the previous range are still in state at that point (useDriverSafety
  // doesn't clear them until the new data arrives) -- showing the bare
  // spinner there used to unmount DateRangeFilter on every click, which
  // reset its internal "active" state to its hardcoded default and
  // re-fired that default's range via its mount effect, snapping the
  // selection back to "This month" no matter what was picked (confirmed
  // root cause of a reported "dates don't move" report, 2026-10-28).
  if (loading && scorecards.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "60px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading the scorecard…
      </div>
    );
  }

  const trendSummary = changeSinceFirst === null
    ? "history starting"
    : `${changeSinceFirst >= 0 ? "up" : "down"} ${Math.abs(round1(changeSinceFirst))}`;

  const tabSummary = {
    rankings: `${totals.redCount} below average`,
    map: "speeding & safety events",
    trends: trendSummary,
    dvir: "vehicle & trailer defects",
    grace: `${totals.graceCount} ${plural(totals.graceCount, "driver")} in grace`,
  };

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)", padding: "24px 28px" }}>
      <Eyebrow>Driver scorecard</Eyebrow>
      <h2 style={{ fontSize: 24, marginTop: 4 }}>
        {totals.scoredCount} {plural(totals.scoredCount, "driver")} scored · fleet average {totals.fleetAverage !== null ? round1(totals.fleetAverage) : "—"}
      </h2>
      {ledeSentence(totals) && (
        <div style={{ fontSize: 13, color: "var(--clg-text-muted)", marginTop: 4, maxWidth: 640 }}>{ledeSentence(totals)}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <DateRangeFilter onChange={setRange} disableAllTime />
        {loading && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--clg-text-muted)" }}>
            <Loader2 size={13} className="spin" /> Updating…
          </span>
        )}
        {range && (
          <button
            onClick={() => setRange(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-link)", fontSize: 12, fontWeight: 600 }}
          >
            Reset to default (trailing 90 days)
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 6 }}>
        {range
          ? "Showing a custom window -- speeding/safety/HOS counts are exact for this range, but miles driven (and events-per-1k-miles) still reflect Samsara's trailing-90-day snapshot, not this specific range."
          : "Showing the official trailing-90-day window -- same data Accountability's fine eligibility uses."}
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13, marginTop: 16 }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 20 }}>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <StatBlock align="left" value={totals.fleetAverage !== null ? round1(totals.fleetAverage) : "—"} label="Fleet average" note="of 100" />
        </div>
        <div style={{
          background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16,
          borderTop: totals.redCount > 0 ? "3px solid var(--clg-scarlet)" : undefined,
        }}>
          <StatBlock align="left" value={totals.redCount} label="Below average" note={totals.redCount > 0 ? "drivers" : "none this period"} />
        </div>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <StatBlock
            align="left"
            value={totals.eventsPer1kMiles !== null ? round1(totals.eventsPer1kMiles) : "—"}
            label="Events per 1K miles"
            note={totals.totalMiles > 0 ? `${totals.totalEvents} events across ${Math.round(totals.totalMiles).toLocaleString()} miles` : undefined}
          />
        </div>
        <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 }}>
          <StatBlock align="left" value={totals.graceCount} label="In grace period" note="first 14 days" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 2, marginTop: 20, background: "var(--clg-surface-subtle)", borderRadius: "var(--clg-radius-md)", padding: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, border: "none", cursor: "pointer", borderRadius: "var(--clg-radius-sm)", padding: "10px 14px", textAlign: "left",
              background: tab === t.id ? "var(--clg-surface-card)" : "transparent",
              boxShadow: tab === t.id ? "var(--clg-shadow-resting)" : "none",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--clg-text-heading)" }}>{t.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)", marginTop: 2 }}>{tabSummary[t.id]}</div>
          </button>
        ))}
      </div>

      <div style={{ background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 20, marginTop: 14 }}>
        {tab === "rankings" && (
          <>
            <RankingsBarChart ranked={ranked} fleetAverage={totals.fleetAverage} />
            <RankingsTable ranked={ranked} range={range} />
          </>
        )}
        {tab === "map" && <IncidentMap />}
        {tab === "trends" && (
          <Trends
            snapshots={snapshots}
            snapshotsLoading={snapshotsLoading}
            changeSinceFirst={changeSinceFirst}
            categoryBreakdown={totals.categoryBreakdown}
          />
        )}
        {tab === "dvir" && <Dvir />}
        {tab === "grace" && <GraceAndScoring graceDrivers={graceDrivers} />}
      </div>

      {totals.scoredCount === 0 && !error && (
        <div style={{ padding: "24px 0", color: "var(--clg-text-muted)", fontSize: 13 }}>
          No drivers scored yet — either none are linked to Samsara or all are still within the grace period.
        </div>
      )}
    </div>
  );
}
