import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Eyebrow, StatBlock, Table } from "../../ds";
import { useDriverSafety } from "../../hooks/useDriverSafety";

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
  { key: "driver_name", label: "Driver" },
  { key: "scoreCell", label: "Score", align: "right" },
  { key: "speeding_score", label: "Speeding", align: "right" },
  { key: "safety_score", label: "Safety", align: "right" },
  { key: "hos_score", label: "HOS", align: "right" },
  { key: "milesCell", label: "Miles", align: "right" },
  { key: "eventsPer1k", label: "Events/1K mi", align: "right" },
];

function RankingsTable({ ranked }) {
  const [bandFilter, setBandFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = ranked
    .filter((d) => bandFilter === "all" || d.score_band === bandFilter)
    .slice()
    .sort((a, b) => a.overall_score - b.overall_score); // lowest first

  const visible = showAll ? filtered : filtered.slice(0, TABLE_PAGE_SIZE);

  const rows = visible.map((row) => {
    const combinedEvents = (row.speeding_event_count || 0) + (row.safety_event_count || 0);
    const eventsPer1k = row.miles_driven > 0 ? combinedEvents / (row.miles_driven / 1000) : null;
    return {
      ...row,
      scoreCell: scoreCell(row),
      speeding_score: round1(row.speeding_score),
      safety_score: round1(row.safety_score),
      hos_score: round1(row.hos_score),
      milesCell: Math.round(row.miles_driven).toLocaleString(),
      eventsPer1k: eventsPer1k === null ? "—" : round1(eventsPer1k),
    };
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow>Ranked · lowest score first</Eyebrow>
        <div style={{ display: "flex", gap: 6 }}>
          {BAND_FILTERS.map((b) => (
            <Chip key={b} active={bandFilter === b} onClick={() => setBandFilter(b)}>
              {b === "all" ? "All" : BAND_LABEL[b]}
            </Chip>
          ))}
        </div>
      </div>
      <Table columns={COLUMNS} rows={rows} />
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
          <li><strong>Safety</strong> loses 5 points per weighted event (following distance 1.5, forward collision 1.75, crash 2.0, harsh brake/turn/rolling stop/yard move/personal-conveyance misuse 0.75–1.0); dismissed events don't count.</li>
          <li><strong>HOS</strong> loses 4 points per weighted violation (missed cert 1.0, missed rest break 0.75, shift/cycle/duty limit 2.75 each).</li>
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

const TABS = [
  { id: "rankings", label: "Rankings" },
  { id: "grace", label: "Grace & scoring" },
];

export default function DriverSafetyView() {
  const { ranked, graceDrivers, totals, loading, error } = useDriverSafety();
  const [tab, setTab] = useState("rankings");

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "60px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading the scorecard…
      </div>
    );
  }

  const tabSummary = {
    rankings: `${totals.redCount} below average`,
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
            <RankingsTable ranked={ranked} />
          </>
        )}
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
