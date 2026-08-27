/** Label + help/error wrapper shared by the form controls. */
export default function Field({ label, help, error, required = false, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }} {...rest}>
      {label && (
        <label htmlFor={htmlFor} style={{
          fontFamily: "var(--clg-font-heading)", fontSize: 12, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clg-text-heading)",
        }}>
          {label}{required && <span style={{ color: "var(--clg-scarlet)" }}> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <span style={{ fontSize: 12, color: "var(--clg-status-critical)" }}>{error}</span>
      ) : help ? (
        <span style={{ fontSize: 12, color: "var(--clg-text-muted)" }}>{help}</span>
      ) : null}
    </div>
  );
}
