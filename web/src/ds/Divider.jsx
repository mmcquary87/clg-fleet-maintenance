const MAP = {
  hairline: { height: 1, background: "var(--clg-border-subtle)" },
  strong: { height: 2, background: "var(--clg-border-strong)" },
  accent: { height: "var(--clg-rule-accent)", background: "var(--clg-surface-accent)", width: 48 },
  inverse: { height: 1, background: "var(--clg-border-inverse)" },
};

/** Horizontal rule. `accent` renders the brand's short scarlet lead rule. */
export default function Divider({ variant = "hairline", width, style, ...rest }) {
  const m = MAP[variant] || MAP.hairline;
  return <div role="separator" style={{ border: 0, width: width || m.width || "100%", ...m, ...style }} {...rest} />;
}
