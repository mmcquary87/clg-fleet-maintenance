import { useState } from "react";

const SIZES = {
  sm: { fontSize: 11, padding: "8px 14px" },
  md: { fontSize: 12, padding: "12px 22px" },
  lg: { fontSize: 14, padding: "16px 32px" },
};

const VARIANTS = {
  primary: { bg: "var(--clg-action-primary-bg)", hover: "var(--clg-action-primary-bg-hover)", fg: "var(--clg-action-primary-fg)", border: "transparent" },
  secondary: { bg: "var(--clg-action-secondary-bg)", hover: "var(--clg-action-secondary-bg-hover)", fg: "var(--clg-action-secondary-fg)", border: "transparent" },
  outline: { bg: "transparent", hover: "var(--clg-surface-subtle)", fg: "var(--clg-action-quiet-fg)", border: "var(--clg-royal)" },
  quiet: { bg: "transparent", hover: "var(--clg-surface-subtle)", fg: "var(--clg-action-quiet-fg)", border: "transparent" },
  inverse: { bg: "var(--clg-white)", hover: "var(--clg-smoke)", fg: "var(--clg-navy)", border: "transparent" },
};

/** Primary call to action. Labels are tracked uppercase Montserrat, per the brand's collateral. */
export default function Button({
  variant = "primary", size = "md", iconLeft, iconRight,
  disabled = false, fullWidth = false, href, children, style, ...rest
}) {
  const [hover, setHover] = useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const Tag = href && !disabled ? "a" : "button";

  const css = {
    display: fullWidth ? "flex" : "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: fullWidth ? "100%" : undefined,
    fontFamily: "var(--clg-font-heading)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: s.fontSize,
    padding: s.padding,
    lineHeight: 1,
    border: "1px solid " + (disabled ? "transparent" : v.border),
    borderRadius: "var(--clg-radius-sm)",
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "var(--clg-action-disabled-bg)" : hover ? v.hover : v.bg,
    color: disabled ? "var(--clg-action-disabled-fg)" : v.fg,
    transition: "background-color var(--clg-dur-base) var(--clg-ease-out), color var(--clg-dur-base) var(--clg-ease-out)",
    ...style,
  };

  return (
    <Tag
      href={href}
      disabled={Tag === "button" ? disabled : undefined}
      style={css}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Tag>
  );
}
