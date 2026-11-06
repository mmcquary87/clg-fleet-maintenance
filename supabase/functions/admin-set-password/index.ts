// Fleet Maintenance System — directly set a user's password (TEMPORARY)
//
// Stopgap for invite-user/password-recovery being blocked by Supabase's
// built-in email rate limit (2026-11-06, no custom SMTP configured yet --
// see the Authentication > Emails > SMTP Settings fix). inviteUserByEmail
// creates a user with NO password and relies entirely on that invite
// email arriving; when it doesn't, the new user has no way in at all.
// This bypasses email completely via the Admin API's updateUserById,
// mirroring invite-user's own admin-gating.
//
// Usage: find the target user's UID in Authentication > Users (the UID
// column), then call this with { userId, password }. Give the chosen
// password to the user directly (Slack/text/in person) -- there's no
// in-app "change my password" screen yet, so they're stuck with whatever
// is set here until that's built or SMTP is fixed and they use "Forgot
// password" normally.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (already available to all edge
// functions) -- no new secret needed.
//
// Delete once custom SMTP is configured and this is no longer needed.

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

    // Same admin-gating as invite-user: verify the caller server-side via
    // their own JWT, not just by hiding a button in the UI.
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
      return new Response(JSON.stringify({ error: "Only admins can set a user's password" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, password } = await req.json();
    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "userId is required (the UID column in Authentication > Users)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return new Response(JSON.stringify({ error: "password is required and must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    return new Response(JSON.stringify({
      updated: true,
      userId: data.user?.id,
      email: data.user?.email,
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
