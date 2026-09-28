import { useMemo, useState } from "react";
import { X, Loader2, Upload } from "lucide-react";
import { Card, Field, Select, Button, Alert } from "../../ds";
import { supabase } from "../../lib/supabaseClient";
import { parseCsv } from "../../lib/parseCsv";

const SEGMENT_OPTIONS = [
  { value: "driver", label: "Driver" },
  { value: "new_mc", label: "New MC" },
  { value: "small_fleet", label: "Small fleet" },
];

// Target lead fields a CSV column can map onto, with a regex used to guess
// a default mapping from the CSV's own header row -- the user can always
// override every guess before importing.
const TARGET_FIELDS = [
  { key: "contact_name", label: "Contact name", guess: /\b(name|driver|applicant)\b/i },
  { key: "phone", label: "Phone", guess: /phone|cell|mobile/i },
  { key: "email", label: "Email", guess: /email/i },
  { key: "city", label: "City", guess: /city/i },
  { key: "state", label: "State", guess: /\bstate\b/i },
  { key: "legal_name", label: "Company / legal name", guess: /company|carrier|legal/i },
  { key: "dot_number", label: "DOT number", guess: /\bdot\b/i },
  { key: "mc_number", label: "MC number", guess: /\bmc\b/i },
];

function guessMapping(headers) {
  const mapping = {};
  for (const f of TARGET_FIELDS) {
    const match = headers.find((h) => f.guess.test(h));
    mapping[f.key] = match ?? "";
  }
  return mapping;
}

export default function TenstreetImportForm({ onCancel, onImported }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState({});
  const [segment, setSegment] = useState("driver");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(guessMapping(parsed.headers));
  };

  const columnOptions = useMemo(
    () => [{ value: "", label: "— not mapped —" }, ...headers.map((h) => ({ value: h, label: h }))],
    [headers],
  );

  const mappedRows = useMemo(() => {
    return rows.map((r) => {
      const rec = {};
      for (const f of TARGET_FIELDS) {
        const col = mapping[f.key];
        rec[f.key] = col ? r[headers.indexOf(col)]?.trim() || null : null;
      }
      return rec;
    });
  }, [rows, mapping, headers]);

  const onImport = async () => {
    setImporting(true);
    setError(null);
    setResult(null);

    const { data: existing } = await supabase.from("leads").select("phone, email");
    const existingPhones = new Set((existing ?? []).map((l) => l.phone).filter(Boolean));
    const existingEmails = new Set((existing ?? []).map((l) => l.email).filter(Boolean));

    const seenPhones = new Set();
    const seenEmails = new Set();
    let skipped = 0;
    const toInsert = [];
    for (const rec of mappedRows) {
      const isDupe =
        (rec.phone && (existingPhones.has(rec.phone) || seenPhones.has(rec.phone))) ||
        (rec.email && (existingEmails.has(rec.email) || seenEmails.has(rec.email)));
      if (isDupe) { skipped++; continue; }
      if (!rec.contact_name && !rec.legal_name && !rec.phone && !rec.email) { skipped++; continue; }
      if (rec.phone) seenPhones.add(rec.phone);
      if (rec.email) seenEmails.add(rec.email);
      toInsert.push({
        segment,
        source_code: "tenstreet",
        contact_name: rec.contact_name,
        legal_name: rec.legal_name,
        phone: rec.phone,
        email: rec.email,
        city: rec.city,
        state: rec.state,
        dot_number: rec.dot_number ? Number(rec.dot_number.replace(/\D/g, "")) || null : null,
        mc_number: rec.mc_number ? rec.mc_number.replace(/\D/g, "") || null : null,
      });
    }

    if (toInsert.length === 0) {
      setImporting(false);
      setResult({ imported: 0, skipped });
      return;
    }

    const { error: err } = await supabase.from("leads").insert(toInsert);
    setImporting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResult({ imported: toInsert.length, skipped });
    onImported?.();
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: "var(--clg-size-h5)", fontWeight: 700 }}>Import from Tenstreet (CSV)</h3>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--clg-text-muted)" }}>
          <X size={18} />
        </button>
      </div>

      {error && <Alert tone="critical" style={{ marginBottom: 14 }}>{error}</Alert>}
      {result && (
        <Alert tone="success" style={{ marginBottom: 14 }}>
          Imported {result.imported} lead{result.imported === 1 ? "" : "s"}
          {result.skipped > 0 ? `, skipped ${result.skipped} (duplicate or empty row)` : ""}.
        </Alert>
      )}

      <div style={{ fontSize: 13, color: "var(--clg-text-muted)", marginBottom: 14 }}>
        Export applicants from Tenstreet as a CSV, then upload it here and map its columns below.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--clg-royal)" }}>
          <Upload size={14} />
          {fileName || "Choose a CSV file"}
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
        </label>
        {rows.length > 0 && <span style={{ fontSize: 12.5, color: "var(--clg-text-muted)" }}>{rows.length} row{rows.length === 1 ? "" : "s"} found</span>}
      </div>

      {headers.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 20 }}>
            <Field label="Segment for this import" required>
              <Select value={segment} onChange={(e) => setSegment(e.target.value)} options={SEGMENT_OPTIONS} />
            </Field>
            {TARGET_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} options={columnOptions} />
              </Field>
            ))}
          </div>

          {mappedRows.length > 0 && (
            <div style={{ marginBottom: 20, overflowX: "auto" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clg-navy)", marginBottom: 8 }}>
                Preview (first 5 rows)
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {TARGET_FIELDS.map((f) => (
                      <th key={f.key} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--clg-border-default)", color: "var(--clg-text-muted)" }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {TARGET_FIELDS.map((f) => (
                        <td key={f.key} style={{ padding: "6px 8px", borderBottom: "1px solid var(--clg-border-subtle)" }}>{r[f.key] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Close</Button>
        <Button type="button" size="sm" disabled={importing || mappedRows.length === 0} onClick={onImport}>
          {importing && <Loader2 size={14} className="spin" />}
          Import {mappedRows.length > 0 ? mappedRows.length + " rows" : ""}
        </Button>
      </div>
    </Card>
  );
}
