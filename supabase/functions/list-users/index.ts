// Fleet Maintenance System — list all users for the Settings → Users panel
//
// profiles has no email column, and auth.users isn't reachable under RLS,
// so this has to run server-side with the service role — same admin-gate
// pattern as invite-user (the caller's admin status is verified here using
// their own JWT; hiding the panel for non-admins client-side is a UX
// nicety, not the security boundary).

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
      return new Response(JSON.stringify({ error: "Only admins can view the user list" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profiles, error: profilesErr } = await adminClient
      .from("profiles").select("id, full_name, role, can_edit_roster, created_at");
    if (profilesErr) throw profilesErr;

    // auth.admin.listUsers pages at up to 1000 per call — fine for CLG's headcount.
    const { data: authList, error: authErr } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (authErr) throw authErr;
    const emailById = new Map(authList.users.map((u) => [u.id, u.email]));

    const users = (profiles ?? [])
      .map((p) => ({ ...p, email: emailById.get(p.id) ?? null }))
      .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""));

    return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
