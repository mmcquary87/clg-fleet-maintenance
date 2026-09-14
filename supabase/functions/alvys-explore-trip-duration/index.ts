// Fleet Maintenance System — Alvys trip drive-time/duration discovery
// probe (TEMPORARY)
//
// KPI 4 (Planned Driver Capacity Utilization) needs "planned productive
// driving capacity" in HOURS -- but every existing trips/search consumer
// (alvys-trips-report, alvys-driver-utilization) only ever reads distance
// fields (EmptyMileage/LoadedMileage/TotalMileage), never a duration/drive
// -time field. Before building KPI 4 on a fabricated "assume N mph"
// conversion from miles, this checks whether Alvys actually exposes a
// real planned-duration field on a trip at all.
//
// Run once via this function's Test button in the Supabase dashboard
// (Authorization: Bearer <anon key>, body {}) and paste the output back.
// Requires ALVYS_CLIENT_ID/ALVYS_CLIENT_SECRET. Doesn't touch our database.
// Delete once the real field names are confirmed either way.

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";

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

// Widest reasonable recent window -- just need a handful of real trips
// with planned data on them, doesn't need to be exhaustive.
function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getAlvysToken();
    const res = await fetch(`${ALVYS_API_BASE}/trips/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        Page: 0, PageSize: 10,
        PickupDateRange: { Start: daysAgo(14), End: daysAgo(0) },
      }),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`trips/search returned non-JSON: ${text.slice(0, 500)}`); }
    if (!res.ok) throw new Error(`trips/search failed (${res.status}): ${text.slice(0, 500)}`);

    const trips: any[] = json.Items ?? [];
    // Every distinct top-level key across the sample, plus a keyword scan
    // for anything that even sounds like a duration/time/hours field --
    // easy to skim past a sparsely-named field in a raw dump alone.
    const allKeys = [...new Set(trips.flatMap((t) => Object.keys(t)))];
    const durationLikeKeys = allKeys.filter((k) =>
      /time|duration|hour|eta|transit|drive/i.test(k)
    );

    return new Response(JSON.stringify({
      total: json.Total,
      tripsReturned: trips.length,
      allTopLevelKeysSeen: allKeys,
      durationLikeKeysSeen: durationLikeKeys,
      sampleTrips: trips.slice(0, 3),
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
