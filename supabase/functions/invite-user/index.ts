// Fleet Maintenance System — invite a new user
//
// Creating an auth user requires the service role (the admin API isn't
// reachable with the anon/user key), so this has to run server-side.
// The caller's admin status is verified here, server-side, using their
// own JWT — the Settings UI hiding the button for non-admins is a UX
// nicety, not the security boundary; this is.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (already available to all edge
// functions) — no new secret needed.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = ["dispatcher", "mechanic", "admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    // Caller-scoped client (respects RLS) to verify the requester is an
    // admin before doing anything privileged.
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
      return new Response(JSON.stringify({ error: "Only admins can invite users" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, fullName, role } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const finalRole = VALID_ROLES.includes(role) ? role : "dispatcher";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName || null, role: finalRole },
    });
    if (error) throw error;

    return new Response(JSON.stringify({
      invited: true,
      userId: data.user?.id,
      email: data.user?.email,
      role: finalRole,
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
