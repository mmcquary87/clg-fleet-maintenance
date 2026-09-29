function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}
function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
}

// Shared with LeadDetailModal and OnboardingCaseModal -- both log into the
// same lead_conversations table (via LogInteractionForm), one keyed by
// lead_id and the other by case_id, so the same read-only feed renders
// either.
export default function ConversationsPanel({ conversations }) {
  if (conversations.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--clg-text-muted)" }}>No activity logged yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {conversations.map((c) => (
        <div key={c.id} style={{ borderLeft: "2px solid var(--clg-border-default)", paddingLeft: 10 }}>
          <div style={{ fontSize: 11.5, color: "var(--clg-text-muted)" }}>
            {fmtDateTime(c.occurred_at)} · {c.channel.replace(/_/g, " ")} · {c.direction.replace(/_/g, " ")} · {c.author}
          </div>
          <div style={{ fontSize: 13, color: "var(--clg-text-body)", marginTop: 2 }}>{c.summary}</div>
          {c.next_step && (
            <div style={{ fontSize: 12, color: "var(--clg-text-muted)", marginTop: 2 }}>
              Next: {c.next_step}{c.next_step_due ? ` by ${fmtDate(c.next_step_due)}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
