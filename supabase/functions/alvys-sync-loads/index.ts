// Fleet Maintenance System — Alvys loads sync
//
// Pulls loads from Alvys's loads/search endpoint and upserts them into our
// own alvys_loads table, so the Operations Dashboard can filter by date
// range against local data instead of re-querying Alvys live (that
// endpoint has NO date-range filter — only Status, PONumbers, CustomerId,
// LoadNumbers, OrderNumbers, UpdatedBy, CustomerSalesAgentId — confirmed
// empirically against the live API since Alvys's docs are gated).
//
// Resumable: request body takes { status, startPage?, maxPages? }. Each
// call processes at most maxPages pages (default 20, ~3000 loads at
// PageSize 150) and returns nextPage so a run that would otherwise risk
// the edge function's execution time limit can be continued across
// multiple manual Test invocations — same pattern as paging through a
// slow bulk API by hand. Safe to re-run: upsert by alvys_load_id.
//
// Requires ALVYS_CLIENT_ID / ALVYS_CLIENT_SECRET secrets + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALVYS_TOKEN_URL = "https://auth.alvys.com/oauth/token";
const ALVYS_API_BASE = "https://integrations.alvys.com/api/p/v1.0";
const PAGE_SIZE = 150;
const DEFAULT_MAX_PAGES = 20;

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

function firstStopOf(stops: any[], type: string) {
  return stops.find((s) => s.StopType === type);
}
function lastStopOf(stops: any[], type: string) {
  const matches = stops.filter((s) => s.StopType === type);
  return matches[matches.length - 1];
}

function mapLoad(l: any) {
  const stops = Array.isArray(l.Stops) ? l.Stops : [];
  const pickup = firstStopOf(stops, "Pickup");
  const delivery = lastStopOf(stops, "Delivery");

  return {
    alvys_load_id: l.Id,
    load_number: l.LoadNumber ?? null,
    customer_name: l.CustomerName ?? null,
    status: l.Status,
    loaded_miles: l.CustomerMileage?.Distance?.Value ?? null,
    linehaul_amount: l.Linehaul?.Amount ?? null,
    customer_rate_amount: l.CustomerRate?.Amount ?? null,

    scheduled_pickup_at: l.ScheduledPickupAt ?? null,
    scheduled_delivery_at: l.ScheduledDeliveryAt ?? null,
    picked_up_at: l.PickedUpAt ?? null,
    delivered_at: l.DeliveredAt ?? null,

    pickup_schedule_type: pickup?.ScheduleType ?? null,
    pickup_window_end: pickup?.StopWindow?.End ?? null,
    pickup_appointment_at: pickup?.AppointmentDate ?? null,
    pickup_arrived_at: pickup?.ArrivedAt ?? null,

    delivery_schedule_type: delivery?.ScheduleType ?? null,
    delivery_window_end: delivery?.StopWindow?.End ?? null,
    delivery_appointment_at: delivery?.AppointmentDate ?? null,
    delivery_arrived_at: delivery?.ArrivedAt ?? null,

    stops,
    alvys_created_at: l.CreatedAt ?? null,
    alvys_updated_at: l.UpdatedAt ?? null,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const status: string = body.status ?? "Delivered";
    const startPage: number = body.startPage ?? 0;
    const maxPages: number = body.maxPages ?? DEFAULT_MAX_PAGES;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = await getAlvysToken();

    let page = startPage;
    let pagesProcessed = 0;
    let itemsUpserted = 0;
    let total = 0;
    let done = false;

    while (pagesProcessed < maxPages) {
      const res = await fetch(`${ALVYS_API_BASE}/loads/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ Page: page, PageSize: PAGE_SIZE, Status: [status] }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`loads/search page ${page} failed (${res.status}): ${text}`);
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`loads/search page ${page} returned non-JSON: ${text.slice(0, 500)}`); }
      if (typeof json.Total !== "number" || !Array.isArray(json.Items)) {
        throw new Error(`loads/search page ${page} unexpected shape: ${text.slice(0, 500)}`);
      }

      total = json.Total;
      pagesProcessed += 1;

      if (json.Items.length > 0) {
        const rows = json.Items.map(mapLoad);
        const { error } = await supabase.from("alvys_loads").upsert(rows, { onConflict: "alvys_load_id" });
        if (error) throw error;
        itemsUpserted += rows.length;
      }

      const processedSoFar = (page + 1) * PAGE_SIZE;
      if (json.Items.length === 0 || processedSoFar >= total) {
        done = true;
        break;
      }
      page += 1;
    }

    return new Response(JSON.stringify({
      status,
      total,
      pagesProcessed,
      itemsUpserted,
      done,
      nextPage: done ? null : page + 1,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === "object" && "message" in err)
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
