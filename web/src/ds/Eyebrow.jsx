const COLORS = {
  brand: "var(--clg-text-brand)",
  accent: "var(--clg-text-accent)",
  muted: "var(--clg-text-muted)",
  inverse: "var(--clg-text-inverse)",
};

/** Tracked uppercase label — the guide's "H E A D I N G" style. */
export default function Eyebrow({ children, tone = "brand", as: Tag = "div", style, ...rest }) {
  return (
    <Tag style={{
      fontFamily: "var(--clg-font-heading)", fontSize: "var(--clg-size-eyebrow)", fontWeight: 700,
      letterSpacing: "var(--clg-tracking-eyebrow)", textTransform: "uppercase", color: COLORS[tone], ...style,
    }} {...rest}>
      {children}
    </Tag>
  );
}
