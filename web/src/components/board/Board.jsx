import { Loader2 } from "lucide-react";
import { useBoard } from "../../hooks/useBoard";
import UnitCard from "./UnitCard";

const LANE_META = {
  waiting_on_you: { title: "Waiting on you", accent: true, hint: "you are the blocker", emptyLine: "Nothing waiting on you." },
  waiting_on_vendor: { title: "Waiting on a vendor", accent: false, emptyLine: "Nothing at a vendor." },
  waiting_on_parts: { title: "Waiting on parts", accent: false, emptyLine: "No parts on order." },
  in_the_bay: { title: "In the bay", accent: false, hint: "nobody needs to do anything", emptyLine: "No unit in a bay." },
};

// The three lanes a dispatcher only monitors (not "waiting_on_you", which is
// framed against those three, not counted alongside them) — used to decide
// whether the single consolidated "empty lanes are good news" note is worth
// showing at all, instead of repeating that sentence in every empty lane.
const MONITORED_LANE_KEYS = ["waiting_on_vendor", "waiting_on_parts", "in_the_bay"];

function money(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function emptyLanesTitle(emptyCount) {
  const countWord = { 1: "One", 2: "Two", 3: "Three" }[emptyCount] || emptyCount;
  return `${countWord} empty ${emptyCount === 1 ? "lane" : "lanes"}`;
}

function itemsPhrase(waitingOnYouCount) {
  if (waitingOnYouCount === 1) return "the one open item sitting";
  if (waitingOnYouCount === 2) return "both open items sitting";
  return `all ${waitingOnYouCount} open items sitting`;
}

function Column({ laneKey, cards, onChanged, closedToday, emptyLanesCount, waitingOnYouCount }) {
  const meta = LANE_META[laneKey];
  const dollars = cards.reduce((s, c) => s + c.costOfWaiting, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "var(--clg-moon)", minWidth: 0 }}>
      <div style={{
        background: "var(--clg-surface-card)", padding: "16px 18px",
        borderTop: `4px solid ${meta.accent ? "var(--clg-scarlet)" : "var(--clg-smoke)"}`,
      }}>
        <div style={{
          fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11.5, letterSpacing: "0.13em",
          textTransform: "uppercase", color: meta.accent ? "var(--clg-ruby)" : "var(--clg-navy)",
        }}>
          {meta.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--clg-pewter)", marginTop: 3 }}>
          {cards.length} unit{cards.length === 1 ? "" : "s"}
          {dollars > 0 && ` · ${money(dollars)} accruing`}
          {meta.hint && ` · ${meta.hint}`}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12, background: "var(--clg-moon)" }}>
        {cards.length === 0 ? (
          <div style={{
            border: "1px dashed var(--clg-mercury)", padding: "16px 12px", fontSize: 12,
            color: "var(--clg-pewter)", textAlign: "center", background: "var(--clg-surface-card)",
          }}>
            {meta.emptyLine}
          </div>
        ) : (
          cards.map((c, i) => <UnitCard key={c.unit.id} card={c} lead={i === 0} onChanged={onChanged} />)
        )}

        {laneKey === "in_the_bay" && (
          <div style={{ background: "var(--clg-navy)", color: "#fff", padding: "18px 16px", marginTop: 4 }}>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.13em" }}>
              BACK ON THE ROAD TODAY
            </div>
            <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 30, marginTop: 6 }}>
              {closedToday} unit{closedToday === 1 ? "" : "s"}
            </div>
          </div>
        )}

        {laneKey === "in_the_bay" && emptyLanesCount > 0 && (
          <div style={{ background: "var(--clg-surface-card)", border: "1px solid var(--clg-moon)", padding: "16px" }}>
            <div style={{
              fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.13em",
              textTransform: "uppercase", color: "var(--clg-navy)",
            }}>
              {emptyLanesTitle(emptyLanesCount)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--clg-granite)", marginTop: 8, lineHeight: 1.5 }}>
              An empty lane is good news — nothing is invented to fill it.
              {waitingOnYouCount > 0 && (
                <> But {itemsPhrase(waitingOnYouCount)} in <em>your</em> lane means the bottleneck is authorization, not shop capacity.</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Board({ onGoToUnits }) {
  const { lanes, totals, closedToday, loading, error, reload } = useBoard();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "60px 0", justifyContent: "center", color: "var(--clg-cool)" }}>
        <Loader2 size={16} className="spin" /> Loading the board…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--clg-font-body)", color: "var(--clg-text-body)" }}>
      <div style={{
        background: "var(--clg-navy)", color: "#fff", padding: "26px 28px",
        display: "flex", alignItems: "center", gap: 40, position: "relative", overflow: "hidden",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--clg-mercury)" }}>Idle right now</div>
          <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 40, lineHeight: 1 }}>
            {totals.idleCount}
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--clg-mercury)", marginLeft: 8 }}>
              {totals.downCount > 0 ? `· ${totals.downCount} can't move a load` : ""}
            </span>
          </div>
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,.18)" }} />
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--clg-mercury)" }}>Cost of waiting, today</div>
          {totals.idleCount > 0 && totals.burnRate === 0 ? (
            <>
              <div style={{ width: 40, height: 3, borderRadius: 2, background: "var(--clg-mercury)", margin: "13px 0 9px" }} />
              <div style={{ fontSize: 13, color: "var(--clg-mercury)" }}>can't compute yet</div>
              <button
                onClick={onGoToUnits}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontSize: 12, color: "var(--clg-scarlet)", textDecoration: "underline",
                }}
              >
                Set an hourly revenue rate
              </button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 40, lineHeight: 1, color: "var(--clg-scarlet)" }}>
                {money(totals.costOfWaiting)}
              </div>
              <div style={{ fontSize: 12, color: "var(--clg-mercury)", marginTop: 2 }}>
                accrued idle revenue · ${Math.round(totals.burnRate)}/hr running
              </div>
            </>
          )}
        </div>
        {lanes.waiting_on_you.length > 0 && (
          <div style={{ marginLeft: "auto", borderLeft: "2px solid var(--clg-scarlet)", paddingLeft: 16, maxWidth: 320, fontSize: 12.5, color: "var(--clg-reflection)" }}>
            {lanes.waiting_on_you.length} of {totals.idleCount} are waiting on a decision from someone inside this building.
            That is the cheapest downtime to eliminate.
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--clg-moon)", minHeight: 500 }}>
        {Object.keys(LANE_META).map((laneKey) => (
          <Column
            key={laneKey} laneKey={laneKey} cards={lanes[laneKey]} onChanged={reload} closedToday={closedToday}
            emptyLanesCount={MONITORED_LANE_KEYS.filter((k) => lanes[k].length === 0).length}
            waitingOnYouCount={lanes.waiting_on_you.length}
          />
        ))}
      </div>
    </div>
  );
}
