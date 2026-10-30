// Fleet Maintenance System — Alvys plate/registration field probe (TEMPORARY)
//
// Confirms whether Alvys's trucks/trailers search API carries plate number /
// registration expiration as real structured fields (like
// InspectionExpirationDate already used by alvys-sync-equipment) or only as
// an uploaded document -- this account has at least one "Registration"
// document AttachmentType on file (alvys-sync-dot-inspections's own header),
// which doesn't by itself mean there's also a structured field. Same spirit
// as the old alvys-explore-truck-spec probe that found the PM/Mid-Trip
// References field ids -- run once via Test, read the real payload back,
// then either wire a real field straight into alvys-sync-equipment, or add
// a References lookup the same way PM/Mid-Trip already work, or confirm
// it's document-only and this needs a different approach entirely.
//
// Dumps the FULL raw record (not just the fields alvys-sync-equipment
// currently maps) for a handful of real trucks/trailers, plus a scan over
// every key name (top-level and inside References) for anything containing
// "plate", "registration", "tag", or "license" -- so the answer doesn't
// depend on guessing the exact field name up front.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets (same as every
// other alvys-* function). Delete once the real plate/registration sync is
// built and confirmed working.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const SAMPLE_SIZE = 5;

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

async function fetchFirstPage(token: string, path: string) {
  const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ Page: 0, PageSize: SAMPLE_SIZE, Status: ["Active"] }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  return Array.isArray(json.Items) ? json.Items : [];
}

// Recursively collects "key path" -> value for any key whose name contains
// one of the target words, case-insensitive -- so this finds the field
// whatever it's actually called (PlateNumber, LicensePlate, TagNumber,
// RegistrationExpiresAt, a References entry named "Tag & Registration", etc.)
// without having to guess it up front.
const TARGET_WORDS = ["plate", "registration", "tag", "license"];

function scanForFields(obj: any, path = ""): Array<{ path: string; value: unknown }> {
  const hits: Array<{ path: string; value: unknown }> = [];
  if (obj === null || typeof obj !== "object") return hits;
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = path ? `${path}.${key}` : key;
    const lower = key.toLowerCase();
    if (TARGET_WORDS.some((w) => lower.includes(w))) {
      hits.push({ path: keyPath, value });
    }
    // References entries carry their own human-readable Name -- check that
    // text too, since the useful match there is on Name, not on the key
    // "References" itself.
    if (key === "References" && Array.isArray(value)) {
      for (const ref of value) {
        const name = String(ref?.Name ?? "").toLowerCase();
        if (TARGET_WORDS.some((w) => name.includes(w))) {
          hits.push({ path: `${keyPath}[Name="${ref?.Name}"]`, value: ref?.Value });
        }
      }
    }
    if (value && typeof value === "object") {
      hits.push(...scanForFields(value, keyPath));
    }
  }
  return hits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const [trucks, trailers] = await Promise.all([
      fetchFirstPage(token, "trucks/search"),
      fetchFirstPage(token, "trailers/search"),
    ]);

    const truckFieldHits = trucks.map((t: any) => ({ truckNum: t.TruckNum, hits: scanForFields(t) }));
    const trailerFieldHits = trailers.map((t: any) => ({ trailerNum: t.TrailerNum, hits: scanForFields(t) }));

    return new Response(JSON.stringify({
      note: "fieldHits = every key (or References entry) whose name contains plate/registration/tag/license, found by scanning the real response -- empty array means nothing matched for that unit, not necessarily that Alvys has no such data (could still be a document, not a field).",
      truckFieldHits,
      trailerFieldHits,
      sampleRawTruck: trucks[0] ?? null,
      sampleRawTrailer: trailers[0] ?? null,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
