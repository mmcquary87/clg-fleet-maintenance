// Fleet Maintenance System — update a user's permissions (Settings → Users)
//
// Currently just can_edit_roster, but shaped as a patch so future per-user
// permission flags can reuse this same admin-gated endpoint instead of
// growing a new one-off function each time.
//
// Same admin-gate pattern as invite-user / list-users: the caller's admin
// status is verified server-side using their own JWT.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerProfile, error: profileErr } = await callerClient
      .from("profiles").select("role").eq("id", caller.id).single();
    if (profileErr || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can change user permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, canEditRoster, canVoidWorkOrders } = await req.json();
    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (canEditRoster === undefined && canVoidWorkOrders === undefined) {
      return new Response(JSON.stringify({ error: "canEditRoster and/or canVoidWorkOrders (boolean) is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (canEditRoster !== undefined && typeof canEditRoster !== "boolean") {
      return new Response(JSON.stringify({ error: "canEditRoster must be a boolean" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (canVoidWorkOrders !== undefined && typeof canVoidWorkOrders !== "boolean") {
      return new Response(JSON.stringify({ error: "canVoidWorkOrders must be a boolean" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const patch: Record<string, boolean> = {};
    if (canEditRoster !== undefined) patch.can_edit_roster = canEditRoster;
    if (canVoidWorkOrders !== undefined) patch.can_void_work_orders = canVoidWorkOrders;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: updateErr } = await adminClient
      .from("profiles").update(patch).eq("id", userId);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ updated: true, userId, ...patch }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
