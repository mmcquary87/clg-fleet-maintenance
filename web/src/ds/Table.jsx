/** Dense operational table: uppercase head, hairline rows, tabular numerals. */
export default function Table({ columns = [], rows = [], zebra = true, style, ...rest }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)", ...style }} {...rest}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key || c} style={{
              textAlign: c.align || "left", padding: "10px 12px", fontFamily: "var(--clg-font-heading)",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--clg-text-brand)", borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
            }}>
              {c.label || c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: zebra && i % 2 ? "var(--clg-surface-subtle)" : "transparent" }}>
            {columns.map((c) => (
              <td key={(c.key || c) + i} style={{
                padding: "11px 12px", textAlign: c.align || "left", borderBottom: "1px solid var(--clg-border-subtle)",
                color: "var(--clg-text-body)", fontVariantNumeric: c.align === "right" ? "tabular-nums" : undefined,
              }}>
                {r[c.key || c]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
