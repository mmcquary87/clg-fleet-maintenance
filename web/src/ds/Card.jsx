import { useState } from "react";

const TONES = {
  default: { background: "var(--clg-surface-card)", border: "1px solid var(--clg-border-subtle)", color: "var(--clg-text-body)" },
  subtle: { background: "var(--clg-surface-subtle)", border: "1px solid transparent", color: "var(--clg-text-body)" },
  brand: { background: "var(--clg-surface-brand)", border: "1px solid transparent", color: "var(--clg-text-inverse)" },
  deep: { background: "var(--clg-surface-brand-deep)", border: "1px solid transparent", color: "var(--clg-text-inverse)" },
  gradient: { background: "var(--clg-gradient-brand)", border: "1px solid transparent", color: "var(--clg-text-inverse)" },
};

/** Content card: white on a hairline, squared corners, optional scarlet lead rule. */
export default function Card({
  rule = false, tone = "default", padding = 24, interactive = false, children, style, ...rest
}) {
  const [hover, setHover] = useState(false);
  const t = TONES[tone] || TONES.default;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...t,
        borderRadius: "var(--clg-radius-md)",
        padding,
        boxSizing: "border-box",
        boxShadow: interactive && hover ? "var(--clg-shadow-md)" : "none",
        transition: "box-shadow var(--clg-dur-base) var(--clg-ease-out)",
        cursor: interactive ? "pointer" : undefined,
        ...style,
      }}
      {...rest}
    >
      {rule && <div style={{ height: "var(--clg-rule-accent)", width: 48, background: "var(--clg-surface-accent)", marginBottom: 16 }} />}
      {children}
    </div>
  );
}
