// Fleet Maintenance System — sync Alvys's driver directory into our own
// `drivers` table.
//
// Confirmed via alvys-explore-drivers: POST /drivers/search requires at
// least one of {Name, Status, IsActive, FleetName, EmployeeId} — using
// IsActive, run once for true and once for false so both active and
// inactive/terminated drivers get captured (inactive ones still need to
// resolve by name for historical roster/trip matching).
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

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

async function fetchAllDrivers(token: string, isActive: boolean) {
  const items: any[] = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${ALVYS_API_BASE}/drivers/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ IsActive: isActive, Page: page, PageSize: PAGE_SIZE }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`drivers/search (IsActive=${isActive}) page ${page} failed (${res.status}): ${text}`);
    const json = JSON.parse(text);
    items.push(...json.Items);
    if (json.Items.length === 0 || items.length >= json.Total) break;
    page += 1;
  }
  return items;
}

function toDateOnly(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : null;
}

function mapDriver(d: any) {
  return {
    id: d.Id,
    employee_id: d.EmployeeId ?? null,
    name: d.Name,
    email: d.Email ?? null,
    phone_number: d.PhoneNumber ?? null,
    driver_type: d.Type ?? null,
    fleet_id: d.Fleet?.Id ?? null,
    fleet_name: d.Fleet?.Name ?? null,
    status: d.Status ?? null,
    is_active: !!d.IsActive,
    license_expires_at: toDateOnly(d.LicenseExpiresAt),
    medical_expires_at: toDateOnly(d.MedicalExpiresAt),
    hired_at: toDateOnly(d.HiredAt),
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getAlvysToken();

    const [active, inactive] = await Promise.all([
      fetchAllDrivers(token, true),
      fetchAllDrivers(token, false),
    ]);

    const rows = [...active, ...inactive].map(mapDriver);
    const { error } = await supabase.from("drivers").upsert(rows, { onConflict: "id" });
    if (error) throw error;

    return new Response(JSON.stringify({
      activeSynced: active.length,
      inactiveSynced: inactive.length,
      totalSynced: rows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
