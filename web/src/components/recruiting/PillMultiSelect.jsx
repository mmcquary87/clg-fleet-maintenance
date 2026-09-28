// Multi-select as a row of toggle pills -- matches the channel-toggle
// pattern already used in OutreachDraftPanel/RecruitingView, since ds has
// no dedicated multi-select control.
export default function PillMultiSelect({ options, values = [], onChange, disabled }) {
  const toggle = (v) => {
    const set = new Set(values);
    if (set.has(v)) set.delete(v); else set.add(v);
    onChange([...set]);
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value} type="button" disabled={disabled} onClick={() => toggle(o.value)}
            style={{
              padding: "5px 12px", borderRadius: "var(--clg-radius-pill)",
              border: "1px solid " + (active ? "var(--clg-royal)" : "var(--clg-border-default)"),
              background: active ? "var(--clg-royal)" : "transparent",
              color: active ? "#fff" : "var(--clg-text-body)", fontSize: 12,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
