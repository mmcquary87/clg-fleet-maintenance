/** Round on/off switch — for a single boolean permission or setting. */
export default function Toggle({ checked = false, onChange, disabled = false, label, style, ...rest }) {
  const track = checked ? "var(--clg-royal)" : "var(--clg-mercury)";
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style,
      }}
    >
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange?.(!checked)}
        style={{
          position: "relative", width: 36, height: 20, borderRadius: "var(--clg-radius-pill)",
          background: track, transition: "background-color var(--clg-dur-base) var(--clg-ease-out)", flexShrink: 0,
        }}
        {...rest}
      >
        <span
          style={{
            position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: "50%",
            background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
            transition: "left var(--clg-dur-base) var(--clg-ease-out)",
          }}
        />
      </span>
      {label && <span style={{ fontSize: "var(--clg-size-small)", color: "var(--clg-text-body)" }}>{label}</span>}
    </label>
  );
}
