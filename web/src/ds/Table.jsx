/** Dense operational table: uppercase head, hairline rows, tabular numerals.
 * Pass sortBy/sortDir + onSort(key) to make columns with a `.key` clickable
 * for sorting (columns without a key, or with sortable: false, stay static).
 */
export default function Table({ columns = [], rows = [], zebra = true, style, sortBy, sortDir, onSort, ...rest }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--clg-size-small)", ...style }} {...rest}>
      <thead>
        <tr>
          {columns.map((c) => {
            const sortable = typeof onSort === "function" && !!c.key && c.sortable !== false;
            const active = sortable && sortBy === c.key;
            return (
              <th
                key={c.key || c}
                onClick={sortable ? () => onSort(c.key) : undefined}
                style={{
                  textAlign: c.align || "left", padding: "10px 12px", fontFamily: "var(--clg-font-heading)",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "var(--clg-text-brand)",
                  opacity: sortable && !active ? 0.75 : 1,
                  borderBottom: "2px solid var(--clg-border-default)", whiteSpace: "nowrap",
                  cursor: sortable ? "pointer" : undefined, userSelect: sortable ? "none" : undefined,
                }}
              >
                {c.label ?? c}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            );
          })}
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
