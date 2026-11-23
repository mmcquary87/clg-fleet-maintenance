// Fleet Maintenance System — Samsara coaching sessions sync
//
// Pulls completed/updated coaching sessions from Samsara's /coaching/sessions/stream into
// samsara_coaching_sessions, so the Accountability screen can suggest "speeding coached in
// Samsara" incidents for a person to confirm (see
// 20261123030000_samsara_coaching_sessions.sql for why this is a suggestion and not an
// automatic incident: the feed is per driver + behavior type + time, not per event).
//
// Window: sessions UPDATED in a short trailing window (default 3 days; the stream filters on
// updatedAtTime, since a session that was due weeks ago can complete today). Pass
// {"startDate": "...", "endDate": "..."} (RFC3339) for an explicit backfill. Read-only against
// Samsara; upserts by session id. Safe to re-run.
//
// Coach names: coachId is a Samsara user id; resolved best-effort via /fleet/users. If that
// lookup fails, coach_name stays null and the screen shows the id.
//
// Requires SAMSARA_API secret + service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const SAMSARA_BASE = "https://api.samsara.com";
const DEFAULT_WINDOW_DAYS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function samsaraGet(path: string, params: Record<string, string>) {
  const token = Deno.env.get("SAMSARA_API");
  if (!token) throw new Error("SAMSARA_API secret not set");
  const url = new URL(`${SAMSARA_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`); }
}

async function fetchAllPaginated(path: string, params: Record<string, string>) {
  const items: any[] = [];
  let after: string | undefined;
  while (true) {
    const json = await samsaraGet(path, { ...params, ...(after ? { after } : {}) });
    items.push(...(Array.isArray(json.data) ? json.data : []));
    if (!json.pagination?.hasNextPage) break;
    after = json.pagination.endCursor;
  }
  return items;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* no body: defaults */ }

    const end = typeof body?.endDate === "string" ? new Date(body.endDate) : new Date();
    const start = typeof body?.startDate === "string"
      ? new Date(body.startDate)
      : new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) throw new Error("invalid startDate/endDate");

    const sessions = await fetchAllPaginated("/coaching/sessions/stream", {
      startTime: start.toISOString(), endTime: end.toISOString(),
    });

    // Our drivers, keyed by their linked Samsara driver id.
    const { data: ourDrivers, error: driversErr } = await supabase
      .from("drivers").select("id, samsara_driver_id").not("samsara_driver_id", "is", null);
    if (driversErr) throw driversErr;
    const ourIdBySamsaraId = new Map<string, string>(ourDrivers.map((d: any) => [String(d.samsara_driver_id), d.id]));

    // Best-effort coach names.
    const coachNameById = new Map<string, string>();
    let coachLookup = "ok";
    // /fleet/users 404'd on this account (2026-11-23); /users is Samsara's current
    // path. Try both, in that order of likelihood, and fall back to ids.
    for (const path of ["/users", "/fleet/users"]) {
      try {
        const users = await fetchAllPaginated(path, {});
        for (const u of users) if (u?.id && u?.name) coachNameById.set(String(u.id), String(u.name));
        coachLookup = `ok via ${path}`;
        break;
      } catch (err) {
        coachLookup = `failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`;
      }
    }

    const rows = sessions
      .filter((s: any) => s?.id && s?.driver?.driverId)
      .map((s: any) => {
        const samsaraDriverId = String(s.driver.driverId);
        const coachId = s.completedCoachId != null ? String(s.completedCoachId) : null;
        return {
          id: String(s.id),
          samsara_driver_id: samsaraDriverId,
          driver_id: ourIdBySamsaraId.get(samsaraDriverId) ?? null,
          session_status: s.sessionStatus ?? null,
          coaching_type: s.coachingType ?? null,
          coach_id: coachId,
          coach_name: coachId ? (coachNameById.get(coachId) ?? null) : null,
          due_at: s.dueAtTime ?? null,
          completed_at: s.completedAtTime ?? null,
          updated_at_samsara: s.updatedAtTime ?? null,
          behavior_types: (s.behaviors ?? []).map((b: any) => b?.coachableBehaviorType ?? ""),
          synced_at: new Date().toISOString(),
        };
      });
    const deduped = Array.from(new Map(rows.map((r) => [r.id, r])).values());

    let upserted = 0;
    for (const batch of chunk(deduped, 500)) {
      const { error } = await supabase.from("samsara_coaching_sessions").upsert(batch, { onConflict: "id" });
      if (error) throw error;
      upserted += batch.length;
    }

    return new Response(JSON.stringify({
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      sessionsFetched: sessions.length,
      sessionsUpserted: upserted,
      sessionsWithoutOurDriver: deduped.filter((r) => !r.driver_id).length,
      coachNamesResolved: coachNameById.size,
      coachLookup,
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
