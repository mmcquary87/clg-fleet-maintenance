// Small hand-rolled CSV parser (RFC 4180 quoting: quoted fields, embedded
// commas/newlines, "" for a literal quote) -- no dependency added just for
// this one import screen. Returns { headers, rows } where rows are arrays
// of strings, same length as headers; a short/ragged row is padded with "".
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // swallow -- \r\n handled via the following \n
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...dataRows] = nonEmpty;
  const width = headers.length;
  const padded = dataRows.map((r) => (r.length === width ? r : [...r, ...Array(Math.max(0, width - r.length)).fill("")].slice(0, width)));
  return { headers, rows: padded };
}
