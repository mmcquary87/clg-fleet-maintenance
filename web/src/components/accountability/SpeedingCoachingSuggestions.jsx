import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Eyebrow, Select, StatusPill } from "../../ds";
import { useSpeedingCoachingSuggestions } from "../../hooks/useSpeedingCoachingSuggestions";
import { useAccountabilityInfractions } from "../../hooks/useAccountabilityInfractions";
import { COACHING_STAGES } from "../../lib/accountabilityEnums";

const PANEL_STYLE = { background: "var(--clg-surface-card)", borderRadius: "var(--clg-radius-md)", boxShadow: "var(--clg-shadow-resting)", padding: 16 };
const SPEEDING_INFRACTIONS = ["Heavy Speeding", "Severe Speeding"];

function fmtEt(iso) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SuggestionRow({ s, infractions, session, onLog, onDismiss }) {
  const defaultInfractionId = s.suggested_infraction_id ?? infractions[0]?.id ?? "";
  const [infractionId, setInfractionId] = useState(defaultInfractionId);
  const [stage, setStage] = useState(s.suggested_stage ?? COACHING_STAGES[0]);
  const [busy, setBusy] = useState(null); // "log" | "dismiss"
  const [error, setError] = useState(null);

  const run = async (kind, fn) => {
    setBusy(kind);
    setError(null);
    const err = await fn();
    if (err) { setError(err.message); setBusy(null); }
  };

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--clg-border-subtle)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1.5fr 200px 200px auto", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{s.driver_name}</div>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>{s.suggested_stage ?? "—"} suggested</div>
        </div>
        <div style={{ fontSize: 12.5 }}>
          <div>{fmtEt(s.episode_start)} ET</div>
          <div style={{ color: "var(--clg-text-muted)" }}>
            peak {s.peak_over_mph} mph over · <StatusPill tone={s.clgos_tier === "Severe" ? "red" : "yellow"}>{s.clgos_tier}</StatusPill>
          </div>
        </div>
        <div style={{ fontSize: 12.5 }}>
          <div>Coached {fmtEt(s.coached_at)} ET</div>
          <div style={{ color: "var(--clg-text-muted)" }}>
            {s.coach_name || `Coach ${s.coach_id ?? "unknown"}`} ·{" "}
            {s.basis === "named" ? s.samsara_behavior : <span title="Samsara did not say what this session covered, so this match is a guess from timing">behavior not specified — check</span>}
          </div>
        </div>
        <Select
          value={infractionId}
          onChange={(e) => setInfractionId(e.target.value)}
          options={infractions.map((i) => ({ value: i.id, label: i.name }))}
        />
        <Select value={stage} onChange={(e) => setStage(e.target.value)} options={COACHING_STAGES} />
        <div style={{ display: "flex", gap: 6 }}>
          <Button size="sm" disabled={busy !== null || !infractionId} onClick={() => run("log", () => onLog(s, { infractionId, stage }))}>
            {busy === "log" && <Loader2 size={13} className="spin" />} Log
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("dismiss", () => onDismiss(s, session?.user?.id))}>
            {busy === "dismiss" && <Loader2 size={13} className="spin" />} Not this one
          </Button>
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--clg-ruby)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// Heavy/Severe speeding episodes that were probably coached in Samsara. A person
// confirms each one before it becomes an incident (Samsara has no per-event
// coaching state for speeding; see useSpeedingCoachingSuggestions.js).
export default function SpeedingCoachingSuggestions({ session, onLogged }) {
  const { suggestions, loading, error, logIncident, dismiss } = useSpeedingCoachingSuggestions();
  const { infractions } = useAccountabilityInfractions();
  const [open, setOpen] = useState(false);

  const options = SPEEDING_INFRACTIONS
    .map((name) => infractions.find((i) => i.name === name))
    .filter(Boolean);

  if (loading) return null;
  if (error) {
    return (
      <Alert tone="critical" title="Couldn't load speeding coaching suggestions" style={{ marginTop: 16 }}>{error}</Alert>
    );
  }
  if (suggestions.length === 0) return null;

  const handleLog = async (s, opts) => {
    const err = await logIncident(s, opts);
    if (!err) onLogged?.();
    return err;
  };

  return (
    <div style={{ ...PANEL_STYLE, marginTop: 20, borderTop: "3px solid var(--clg-royal)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>Speeding coached in Samsara</Eyebrow>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>
            {suggestions.length} possible {suggestions.length === 1 ? "incident" : "incidents"} to confirm
          </div>
          <div style={{ fontSize: 12.5, color: "var(--clg-text-muted)", marginTop: 2, maxWidth: 720 }}>
            Samsara shows a driver was coached, not which speeding event it covered, so each match below is a suggestion. Log the ones that are right; use "Not this one" for the rest. Nothing is logged until you confirm.
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Review"}</Button>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {suggestions.map((s) => (
            <SuggestionRow key={s.suggestion_key} s={s} infractions={options} session={session} onLog={handleLog} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
