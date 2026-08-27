// Fleet Maintenance System — Google Sheet CSV backup discovery probe (TEMPORARY)
//
// Fetches the published-to-web CSV of the driver-assignment-history
// backup sheet (refreshed every 4 hours) and returns its header row plus
// a few sample rows, so we can see the actual column names/shapes before
// designing the real ingestion function and storage table.
//
// Delete once the real ingestion is built. Requires
// ALVYS_LOADS_SHEET_CSV_URLASSIGNMENTS secret (the published CSV link).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Minimal CSV line splitter — good enough for a header/sample preview.
// Does not attempt full RFC 4180 quoting/escaping; the real ingestion
// function will use a proper parser once we know the shape.
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("ALVYS_LOADS_SHEET_CSV_URLASSIGNMENTS");
    if (!url) throw new Error("ALVYS_LOADS_SHEET_CSV_URLASSIGNMENTS secret not set");

    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) throw new Error(`Sheet CSV fetch failed (${res.status}): ${text.slice(0, 500)}`);

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const header = lines[0] ? splitCsvLine(lines[0]) : [];
    const sampleRows = lines.slice(1, 6).map(splitCsvLine);

    return new Response(JSON.stringify({
      status: res.status,
      contentType: res.headers.get("content-type"),
      totalLines: lines.length,
      header,
      sampleRows,
      rawFirst500Chars: text.slice(0, 500),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
