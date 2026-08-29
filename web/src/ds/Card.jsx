import { useState } from "react";

const TONES = {
  default: { background: "var(--clg-surface-card)", border: "none", color: "var(--clg-text-body)" },
  subtle: { background: "var(--clg-surface-subtle)", border: "1px solid transparent", color: "var(--clg-text-body)" },
  brand: { background: "var(--clg-surface-brand)", border: "1px solid transparent", color: "var(--clg-text-inverse)" },
  deep: { background: "var(--clg-surface-brand-deep)", border: "1px solid transparent", color: "var(--clg-text-inverse)" },
  gradient: { background: "var(--clg-gradient-brand)", border: "1px solid transparent", color: "var(--clg-text-inverse)" },
};

// Elevation, not hairlines, separates cards on a light surface — a hairline
// survives only *inside* a card, as a row/section divider. "focus" is the
// one-per-screen decision card (pair with rule to add its 3px Scarlet top rule).
const ELEVATION_SHADOW = {
  none: "none",
  resting: "var(--clg-shadow-resting)",
  raised: "var(--clg-shadow-raised)",
  focus: "var(--clg-shadow-focus)",
};

/** Content card: elevated on a light surface, squared corners, optional scarlet lead rule. */
export default function Card({
  rule = false, tone = "default", padding = 24, interactive = false,
  elevation = tone === "default" ? "resting" : "none",
  children, style, ...rest
}) {
  const [hover, setHover] = useState(false);
  const t = TONES[tone] || TONES.default;
  const activeElevation = interactive && hover ? "raised" : elevation;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...t,
        borderRadius: "var(--clg-radius-md)",
        padding,
        boxSizing: "border-box",
        boxShadow: ELEVATION_SHADOW[activeElevation] ?? "none",
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
