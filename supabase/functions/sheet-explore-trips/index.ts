// Fleet Maintenance System — Google Sheet CSV discovery probe (TEMPORARY)
//
// Same pattern as sheet-explore, but for the separate "trips and loads"
// tab (same spreadsheet, different tab, hourly refresh) CLG pointed to on
// 2026-08-30 as a possible source for the KPI 1/4/10/11 planning-snapshot
// gaps — richer than the existing driver-assignment-history tab that
// alvys-assignment-stability (KPI 2) already reads.
//
// Fetches that tab's published-to-web CSV and returns its header row plus
// a few sample rows, so we can see actual column names/shapes before
// deciding which KPIs it can unblock.
//
// Delete once real ingestion is built. Requires ALVYS_LOADS_SHEET_CSV_URLTRIPS
// secret (the published CSV link for this specific tab — Google Sheets
// gives each tab its own link under File > Share > Publish to web).

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
    const url = Deno.env.get("ALVYS_LOADS_SHEET_CSV_URLTRIPS");
    if (!url) throw new Error("ALVYS_LOADS_SHEET_CSV_URLTRIPS secret not set");

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
