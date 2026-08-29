// Cross-cutting status vocabulary (ui-improvement-punch-list.md):
//   green/yellow/red  — a value measured against an *approved* threshold.
//   pending           — no threshold approved yet; show the number, no
//                        color judgment. Don't reach for red/yellow here.
//   neutral           — workflow/availability state that isn't a
//                        performance judgment at all ("in progress", "not
//                        tracked", "inactive").
// Every pill pairs its color with a text label — never color alone.
const TONES = {
  green: { background: "#E3F3EA", color: "#1F7A4D" },
  yellow: { background: "#FBEED9", color: "#9A6B1E" },
  red: { background: "#FBE4E1", color: "var(--clg-ruby)" },
  pending: { background: "var(--clg-smoke)", color: "var(--clg-pewter)" },
  neutral: { background: "var(--clg-smoke)", color: "var(--clg-granite)" },
};

export default function StatusPill({ tone = "neutral", children, style, ...rest }) {
  const toneStyle = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 11.5, fontWeight: 600, padding: "3px 10px", whiteSpace: "nowrap",
        borderRadius: "var(--clg-radius-pill)", ...toneStyle, ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
