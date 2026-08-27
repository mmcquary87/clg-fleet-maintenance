import { useState } from "react";

/** Native select styled to match Input, with a chevron drawn by the brand's border colour. */
export default function Select({ options = [], invalid = false, disabled = false, placeholder, style, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          appearance: "none",
          fontFamily: "var(--clg-font-body)",
          fontSize: "var(--clg-size-body)",
          color: disabled ? "var(--clg-action-disabled-fg)" : "var(--clg-text-body)",
          background: disabled ? "var(--clg-surface-subtle)" : "var(--clg-surface-page)",
          border: "1px solid " + (invalid ? "var(--clg-status-critical)" : focus ? "var(--clg-royal)" : "var(--clg-border-default)"),
          borderRadius: "var(--clg-radius-sm)",
          padding: "11px 36px 11px 12px",
          outline: "none",
          boxShadow: focus && !invalid ? "var(--clg-focus-ring)" : "none",
          ...style,
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) =>
          typeof o === "string"
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
      <span style={{
        position: "absolute", right: 12, top: "50%", width: 8, height: 8,
        borderRight: "2px solid var(--clg-cool)", borderBottom: "2px solid var(--clg-cool)",
        transform: "translateY(-70%) rotate(45deg)", pointerEvents: "none",
      }} />
    </div>
  );
}
