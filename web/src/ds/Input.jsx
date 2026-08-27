import { useState } from "react";

/** Single-line text input. */
export default function Input({ invalid = false, disabled = false, style, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      disabled={disabled}
      onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "var(--clg-font-body)",
        fontSize: "var(--clg-size-body)",
        color: disabled ? "var(--clg-action-disabled-fg)" : "var(--clg-text-body)",
        background: disabled ? "var(--clg-surface-subtle)" : "var(--clg-surface-page)",
        border: "1px solid " + (invalid ? "var(--clg-status-critical)" : focus ? "var(--clg-royal)" : "var(--clg-border-default)"),
        borderRadius: "var(--clg-radius-sm)",
        padding: "11px 12px",
        outline: "none",
        boxShadow: focus && !invalid ? "var(--clg-focus-ring)" : "none",
        transition: "border-color var(--clg-dur-base) var(--clg-ease-out), box-shadow var(--clg-dur-base) var(--clg-ease-out)",
        ...style,
      }}
      {...rest}
    />
  );
}
