import { Loader2 } from "lucide-react";
import { useBoard } from "../../hooks/useBoard";
import UnitCard from "./UnitCard";

const LANE_META = {
  waiting_on_you: { title: "Waiting on you", accent: true, hint: "you are the blocker", emptyLine: "Nothing waiting on you." },
  waiting_on_vendor: { title: "At a vendor", accent: false, emptyLine: "Nothing at a vendor." },
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

function EmptyLaneCard({ text }) {
  return (
    <div style={{
      background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)", borderRadius: "var(--clg-radius-md)",
      padding: "16px 12px", fontSize: 12, color: "var(--clg-pewter)", textAlign: "center",
    }}>
      {text}
    </div>
  );
}

// The primary lane (Waiting on you): full-width header, one expanded lead
// card, remaining items as compact single-line rows.
function PrimaryLane({ cards, onChanged }) {
  const meta = LANE_META.waiting_on_you;

  return (
    <div>
      <div style={{
        fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12, letterSpacing: "0.13em",
        textTransform: "uppercase", color: "var(--clg-ruby)",
      }}>
        {meta.title}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--clg-pewter)", marginTop: 3, marginBottom: 14 }}>
        {cards.length} unit{cards.length === 1 ? "" : "s"}
        {cards.length > 0 && ` · ${meta.hint}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.length === 0 ? (
          <EmptyLaneCard text={meta.emptyLine} />
        ) : (
          cards.map((c, i) => <UnitCard key={c.unit.id} card={c} lead={i === 0} onChanged={onChanged} />)
        )}
      </div>
    </div>
  );
}

// A monitored lane (At a vendor / Waiting on parts / In the bay): plain
// text header directly on the page background, every item a compact row —
// there is no expanded "lead" item outside the lane you own.
function MonitoredLane({ laneKey, cards, onChanged }) {
  const meta = LANE_META[laneKey];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.13em",
          textTransform: "uppercase", color: "var(--clg-navy)",
        }}>
          {meta.title}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--clg-cool)" }}>{cards.length}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {cards.length === 0 ? (
          <EmptyLaneCard text={meta.emptyLine} />
        ) : (
          cards.map((c) => <UnitCard key={c.unit.id} card={c} lead={false} onChanged={onChanged} />)
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

  const emptyLanesCount = MONITORED_LANE_KEYS.filter((k) => lanes[k].length === 0).length;
  const waitingOnYouCount = lanes.waiting_on_you.length;

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
        {waitingOnYouCount > 0 && (
          <div style={{ marginLeft: "auto", borderLeft: "2px solid var(--clg-scarlet)", paddingLeft: 16, maxWidth: 320, fontSize: 12.5, color: "var(--clg-reflection)" }}>
            {waitingOnYouCount} of {totals.idleCount} are waiting on a decision from someone inside this building.
            That is the cheapest downtime to eliminate.
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FBEAEB", color: "var(--clg-ruby)", fontSize: 13 }}>{error}</div>
      )}

      {/* 46/54 split — the lane you own gets the wider, expanded-first-item
          side; the three lanes you only monitor share the rest as compact
          stacks. Attention comes from this layout, not from color. */}
      <div style={{ display: "grid", gridTemplateColumns: "46fr 54fr", gap: 24, padding: "24px 28px" }}>
        <PrimaryLane cards={lanes.waiting_on_you} onChanged={reload} />

        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {MONITORED_LANE_KEYS.map((laneKey) => (
              <MonitoredLane key={laneKey} laneKey={laneKey} cards={lanes[laneKey]} onChanged={reload} />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
            <div style={{
              background: "var(--clg-navy)", color: "#fff", padding: "18px 16px", borderRadius: "var(--clg-radius-md)",
              boxShadow: "var(--clg-shadow-resting)",
            }}>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 11, letterSpacing: "0.13em" }}>
                BACK ON THE ROAD TODAY
              </div>
              <div style={{ fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 30, marginTop: 6 }}>
                {closedToday} unit{closedToday === 1 ? "" : "s"}
              </div>
            </div>

            {emptyLanesCount > 0 && (
              <div style={{
                background: "var(--clg-surface-card)", boxShadow: "var(--clg-shadow-resting)",
                borderRadius: "var(--clg-radius-md)", padding: "16px",
              }}>
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
      </div>
    </div>
  );
}
