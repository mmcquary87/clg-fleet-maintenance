const TONES = {
  brand: ["var(--clg-royal)", "#fff"],
  accent: ["var(--clg-scarlet)", "#fff"],
  critical: ["var(--clg-ruby)", "#fff"],
  neutral: ["var(--clg-smoke)", "var(--clg-granite)"],
  outline: ["transparent", "var(--clg-royal)"],
};

/** Small status chip. */
export default function Badge({ tone = "brand", children, style, ...rest }) {
  const [bg, fg] = TONES[tone] || TONES.brand;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color: fg,
        border: tone === "outline" ? "1px solid var(--clg-royal)" : "1px solid transparent",
        fontFamily: "var(--clg-font-heading)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: "var(--clg-radius-pill)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
