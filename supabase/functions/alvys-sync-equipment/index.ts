// Fleet Maintenance System — Alvys equipment (trucks/trailers) sync
//
// Pulls all trucks + trailers from Alvys and upserts them into our `units`
// table. Matches existing units by number (case-insensitive) so units
// created manually (via intake) get enriched rather than duplicated;
// units.alvys_asset_id is set so future runs update in place.
//
// Safe to re-run — idempotent upsert by number/alvys_asset_id.
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role
// access (writes bypass RLS via the service role key, since this runs
// server-side on a schedule/manual trigger, not on behalf of one user).

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 200;

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
  let page = 1;
  while (true) {
    const res = await fetch(`${ALVYS_API_BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, ...extraBody }),
    });
    if (!res.ok) throw new Error(`${path} page ${page} failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    items.push(...(json.Items ?? []));
    if (items.length >= (json.Total ?? 0) || (json.Items ?? []).length === 0) break;
    page += 1;
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getAlvysToken();
    const [trucks, trailers] = await Promise.all([
      fetchAllPages(token, "trucks/search", { IsActive: true }),
      fetchAllPages(token, "trailers/search", { Status: ["Active"] }),
    ]);

    const alvysUnits = [
      ...trucks.map((t) => ({ number: t.TruckNum, type: "Truck", vin: t.VinNumber ?? null, alvys_asset_id: t.Id })),
      ...trailers.map((t) => ({ number: t.TrailerNum, type: "Trailer", vin: t.VinNum ?? null, alvys_asset_id: t.Id })),
    ].filter((u) => u.number);

    const { data: existing, error: fetchErr } = await supabase.from("units").select("id, number");
    if (fetchErr) throw fetchErr;
    const byNumber = new Map(existing.map((u: any) => [u.number.toLowerCase(), u.id]));

    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    for (const u of alvysUnits) {
      const existingId = byNumber.get(u.number.toLowerCase());
      if (existingId) {
        toUpdate.push({ id: existingId, ...u });
      } else {
        toInsert.push(u);
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("units").insert(toInsert);
      if (insErr) throw insErr;
    }
    for (const u of toUpdate) {
      const { id, ...fields } = u;
      const { error: updErr } = await supabase.from("units").update(fields).eq("id", id);
      if (updErr) throw updErr;
    }

    return new Response(JSON.stringify({
      trucksFound: trucks.length,
      trailersFound: trailers.length,
      unitsCreated: toInsert.length,
      unitsUpdated: toUpdate.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
