// Fleet Maintenance System — Alvys `References` field discovery probe
// (TEMPORARY)
//
// Originally a 3-sample truck/trailer spec dump (used to confirm the
// InspectionExpirationDate/InspectionExpiresAt fields behind the DOT
// inspection date fix in alvys-sync-equipment). Repurposed 2026-09-18 to
// investigate Alvys's `References` array -- the custom per-account fields
// shown on Alvys's "Edit Truck" screen under Last/Next PM Date & Odometer
// Reading and Next/Last MT Due -- ahead of pulling that data into the app
// the same way the DOT inspection date was.
//
// References are keyed by a `ReferenceId` GUID that (per Alvys support
// conventions and the free-text-name mismatches already seen elsewhere in
// this integration, e.g. trailing-space "Next MT Due ") is the stable
// identifier per reference *type* -- `Name` is a human label that can vary
// in exact wording/whitespace across records. This scans every active
// truck/trailer (not just a few samples, unlike the original version of
// this file) and aggregates every distinct {ReferenceId, Name, Type} seen,
// plus a few sample Values per ReferenceId, so a reliable ReferenceId->
// meaning mapping can be confirmed across the whole fleet before writing
// any sync logic against it.
//
// Also fixes this file's own trucks/search filter to match the corrected
// { Status: ["Active"] } filter alvys-sync-equipment now uses -- this file
// still had the old { IsActive: true } filter, which Alvys silently
// ignores (see alvys-sync-equipment's header comment).
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET. Doesn't touch our database.
// Delete once the real ReferenceId mapping is confirmed and the real sync
// is built.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getAlvysToken(): Promise<string> {
  const clientId = Deno.env.get("ALVYS_CLIENT_ID");
  const clientSecret = Deno.env.get("ALVYS_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET not set");
  const res = await fetch(ALVYS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, audience: "https://api.alvys.com/public/", grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Alvys token request failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchAllPages(token: string, path: string, extraBody: Record<string, unknown>) {
  const items: any[] = [];
  let page = 0; // Alvys' Page parameter is 0-indexed
  while (true) {
    const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, ...extraBody }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} page ${page} failed (${res.status}): ${text.slice(0, 500)}`);
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`${path} page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
    if (typeof json.Total !== "number" || !Array.isArray(json.Items)) {
      throw new Error(`${path} page ${page} unexpected shape: ${text.slice(0, 500)}`);
    }
    items.push(...json.Items);
    if (items.length >= json.Total || json.Items.length === 0) break;
    page += 1;
  }
  return items;
}

// Aggregates every distinct {ReferenceId, Name, Type} seen across a set of
// truck/trailer records, with a few sample (unit number, value) pairs per
// ReferenceId -- enough to confirm meaning + value shape without dumping
// the entire fleet's raw References verbatim.
function aggregateReferences(units: any[], numberField: string) {
  const byRefId = new Map<string, { referenceId: string; namesSeen: Set<string>; typesSeen: Set<string>; samples: { unit: string; value: any }[]; count: number }>();
  for (const u of units) {
    const refs: any[] = Array.isArray(u.References) ? u.References : [];
    for (const r of refs) {
      const key = r.ReferenceId ?? `(no ReferenceId) ${r.Name}`;
      if (!byRefId.has(key)) {
        byRefId.set(key, { referenceId: key, namesSeen: new Set(), typesSeen: new Set(), samples: [], count: 0 });
      }
      const agg = byRefId.get(key)!;
      agg.namesSeen.add(r.Name);
      agg.typesSeen.add(r.Type);
      agg.count += 1;
      if (agg.samples.length < 5) agg.samples.push({ unit: u[numberField], value: r.Value });
    }
  }
  return [...byRefId.values()]
    .map((agg) => ({
      referenceId: agg.referenceId,
      namesSeen: [...agg.namesSeen],
      typesSeen: [...agg.typesSeen],
      seenOnCount: agg.count,
      samples: agg.samples,
    }))
    .sort((a, b) => b.seenOnCount - a.seenOnCount);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const [trucks, trailers] = await Promise.all([
      fetchAllPages(token, "trucks/search", { Status: ["Active"] }),
      fetchAllPages(token, "trailers/search", { Status: ["Active"] }),
    ]);

    return new Response(JSON.stringify({
      trucksScanned: trucks.length,
      trailersScanned: trailers.length,
      truckReferences: aggregateReferences(trucks, "TruckNum"),
      trailerReferences: aggregateReferences(trailers, "TrailerNum"),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
