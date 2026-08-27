/** A single operational figure with its label. */
export default function StatBlock({ value, label, note, tone = "default", align = "left", style, ...rest }) {
  const fg = tone === "inverse" ? "var(--clg-text-inverse)" : "var(--clg-text-heading)";
  const sub = tone === "inverse" ? "rgb(255 255 255 / .72)" : "var(--clg-text-muted)";
  return (
    <div style={{ textAlign: align, ...style }} {...rest}>
      <div style={{
        fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 40,
        lineHeight: 1.05, letterSpacing: "-0.01em", color: fg, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "var(--clg-font-heading)", fontWeight: 700, fontSize: 12,
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: tone === "inverse" ? "rgb(255 255 255 / .85)" : "var(--clg-text-brand)", marginTop: 8,
      }}>
        {label}
      </div>
      {note && <div style={{ fontSize: 13, color: sub, marginTop: 6 }}>{note}</div>}
    </div>
  );
}
