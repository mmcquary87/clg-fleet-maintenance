const STAGES = [
  { key: "members", label: "Targeted", color: "var(--clg-moon)" },
  { key: "contacted", label: "Contacted", color: "var(--clg-mercury)" },
  { key: "responded", label: "Responded", color: "var(--clg-royal)" },
  { key: "converted", label: "Converted", color: "var(--clg-navy)" },
];

// A compact 4-cell version of the campaign funnel for the campaigns list --
// each cell's bar width is proportional to its count relative to the
// targeted (first-stage) total, same light-to-dark palette as the full
// trapezoid funnel on the campaign record.
export default function MiniFunnel({ counts }) {
  const targeted = counts.members || 0;
  if (targeted === 0) {
    return <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>No members yet</span>;
  }
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {STAGES.map((s) => {
        const count = counts[s.key] || 0;
        const pct = Math.round((count / targeted) * 100);
        return (
          <div key={s.key} style={{ width: 44 }}>
            <div style={{ height: 6, borderRadius: 3, background: "var(--clg-surface-subtle)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: s.color, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--clg-text-muted)", marginTop: 3 }}>{count}</div>
          </div>
        );
      })}
    </div>
  );
}
