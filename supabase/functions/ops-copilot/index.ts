// Fleet Maintenance System — Ops Copilot
//
// A natural-language Q&A layer over CLG OS's own data: "which trucks go
// empty this week," "which vendor is slow on estimates," "what's unit
// 3307's status" -- answered from real Postgres data instead of five
// page-visits. First concrete build from the AI-differentiation pitch
// (2026-09-04): most competitors run off-the-shelf TMS with no room to
// embed this; CLG OS is a custom platform an assistant can actually sit on
// top of.
//
// Deliberately NOT a free-form SQL agent -- that's a real injection/safety
// surface for an internal tool with no server to sandbox it. Instead this
// is the same "strict tool use" shape as scan-invoice: a fixed set of named
// tools, each backed by a real, bounded Postgrest query (the same shape
// useBoard/useReloadGaps/useVendorActivity/useWorkOrders already run
// client-side), so Claude can only ever ask for data through a known,
// reviewed path -- never execute an arbitrary query. Runs the caller's own
// auth (respects RLS, same as every other read-only function here).
//
// Stateless: the frontend keeps conversation history in React state and
// resends the whole thing each turn (matches this app's "no server to
// babysit" model -- no chat-history table for v1). Each turn runs its own
// tool-use loop server-side; the frontend only ever sees clean user/
// assistant text turns, never the intermediate tool_use/tool_result blocks.
//
// Requires ANTHROPIC_API_KEY (Edge Functions -> Secrets, already set for
// scan-invoice).

import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5";
const MAX_TOOL_TURNS = 5; // safety cap on the tool-use loop, not a real limit any real question should hit

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = [
  "You are the Ops Copilot embedded in CLG OS, the internal fleet management app for CLG Transportation, a trucking company.",
  "Answer the dispatcher's or manager's question using the tools available to you to pull real data -- never invent a number, unit, or vendor name.",
  "If a tool returns no matching data, say so plainly rather than guessing.",
  "Call as many tools as the question actually needs (including more than one), then answer in a few direct sentences plus a short list only if it helps -- this is a quick operational answer, not a report.",
  "Cite specific unit numbers, vendor names, and dollar figures from the tool results. Round dollars to the nearest whole number.",
].join(" ");

const LANE_LABELS = {
  waiting_on_you: "Waiting on you",
  waiting_on_vendor: "At a vendor",
  waiting_on_parts: "Waiting on parts",
  in_the_bay: "In the bay",
};

function laneFor(wo) {
  if (wo.approval_status === "needs_approval") return "waiting_on_you";
  if (wo.waiting_on_parts) return "waiting_on_parts";
  if (wo.assigned_bay && wo.status === "In Progress") return "in_the_bay";
  if (wo.vendor_id) return "waiting_on_vendor";
  return "waiting_on_you";
}

function idleHours(unit, wo) {
  const since = unit.idle_since || wo.date_opened;
  if (!since) return 0;
  return Math.max(0, (Date.now() - new Date(since).getTime()) / 36e5);
}

const TOOLS = [
  {
    name: "get_idle_and_down_units",
    description:
      "Every unit currently on the maintenance Board (an open or in-progress work order) -- which lane it's in " +
      "(waiting on you / at a vendor / waiting on parts / in the bay), how many hours it's been idle, and the " +
      "dollar cost of waiting so far. Use for questions about idle trucks, downtime, or \"what's stuck right now\".",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_reload_gaps",
    description:
      "Active trucks with no planned trip in Alvys at all (\"no plan\"), or delivering within 24 hours with no " +
      "next load visible yet (\"delivering soon\") -- trucks at risk of going empty. Use for questions about " +
      "reloads or empty-truck risk.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_vendor_performance",
    description:
      "Vendor jobs and spend year-to-date, and which units (if any) a vendor is currently holding via an open " +
      "work order. Optionally filter to one vendor by name.",
    input_schema: {
      type: "object",
      properties: {
        vendor_name: { type: ["string", "null"], description: "Partial vendor name to filter to one vendor, or null for all vendors" },
      },
      required: ["vendor_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_spend_summary",
    description:
      "Closed, non-voided maintenance spend totals for a date range, broken down by category and by the " +
      "highest-spend units. Use for questions about spend, cost, or budget.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: ["string", "null"], description: "YYYY-MM-DD, or null for no lower bound" },
        end_date: { type: ["string", "null"], description: "YYYY-MM-DD, or null for no upper bound" },
      },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    },
  },
  {
    name: "get_unit_status",
    description:
      "Look up one specific unit by number: current status, any open work orders, and its 5 most recent closed " +
      "work orders. Use when the question names a specific unit number.",
    input_schema: {
      type: "object",
      properties: { unit_number: { type: "string", description: "The unit number as it appears in the app, e.g. \"3307\"" } },
      required: ["unit_number"],
      additionalProperties: false,
    },
  },
];

async function runTool(supabase, name, input) {
  switch (name) {
    case "get_idle_and_down_units": {
      const { data, error } = await supabase
        .from("work_orders")
        .select(
          "category, complaint, description, status, date_opened, approval_status, assigned_bay, waiting_on_parts, " +
          "unit:units(number, hourly_revenue_rate, idle_since, can_move_load, current_location), vendor:vendors(name)",
        )
        .neq("status", "Closed")
        .eq("voided", false)
        .order("date_opened", { ascending: true });
      if (error) throw error;

      const byUnit = new Map();
      for (const wo of data ?? []) {
        if (!wo.unit) continue;
        if (!byUnit.has(wo.unit.number)) byUnit.set(wo.unit.number, wo);
      }
      const units = [...byUnit.values()].map((wo) => {
        const hours = idleHours(wo.unit, wo);
        return {
          unit: wo.unit.number,
          lane: LANE_LABELS[laneFor(wo)],
          issue: wo.complaint || wo.description || wo.category,
          vendor: wo.vendor?.name ?? null,
          location: wo.unit.current_location,
          can_move_load: wo.unit.can_move_load,
          idle_hours: Math.round(hours * 10) / 10,
          cost_of_waiting_usd: Math.round(hours * (Number(wo.unit.hourly_revenue_rate) || 0)),
        };
      });
      return { units, count: units.length };
    }

    case "get_reload_gaps": {
      const { data: units, error: unitsErr } = await supabase
        .from("units")
        .select("id, number, current_location, driver_name, can_move_load")
        .eq("type", "Truck").eq("is_active", true)
        .or("can_move_load.is.null,can_move_load.eq.true");
      if (unitsErr) throw unitsErr;

      const { data: trips, error: tripsErr } = await supabase
        .from("unit_current_trip")
        .select("unit_id, load_number, stop_type, stop_name, stop_appointment_at, stop_window_end");
      if (tripsErr) throw tripsErr;

      const tripByUnitId = new Map((trips ?? []).map((t) => [t.unit_id, t]));
      const soonCutoff = Date.now() + 24 * 3600000;
      const noPlan = [];
      const deliveringSoon = [];
      for (const u of units ?? []) {
        const trip = tripByUnitId.get(u.id);
        if (!trip) { noPlan.push({ unit: u.number, location: u.current_location, driver: u.driver_name }); continue; }
        if (trip.stop_type !== "Delivery") continue;
        const deadline = trip.stop_window_end || trip.stop_appointment_at;
        if (deadline && new Date(deadline).getTime() <= soonCutoff) {
          deliveringSoon.push({ unit: u.number, driver: u.driver_name, delivering_at: trip.stop_name, deadline });
        }
      }
      return { no_plan: noPlan, delivering_soon_24h: deliveringSoon };
    }

    case "get_vendor_performance": {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      let vendorQuery = supabase.from("vendors").select("id, name");
      if (input.vendor_name) vendorQuery = vendorQuery.ilike("name", `%${input.vendor_name}%`);
      const { data: vendors, error: vErr } = await vendorQuery;
      if (vErr) throw vErr;
      if ((vendors ?? []).length === 0) return { vendors: [] };

      const vendorIds = vendors.map((v) => v.id);
      const [ytdRes, holdingRes] = await Promise.all([
        supabase.from("work_orders").select("vendor_id, cost").in("vendor_id", vendorIds)
          .eq("voided", false).eq("status", "Closed").gte("date_closed", yearStart),
        supabase.from("work_orders").select("vendor_id, unit:units(number)").in("vendor_id", vendorIds)
          .eq("voided", false).neq("status", "Closed"),
      ]);
      if (ytdRes.error) throw ytdRes.error;
      if (holdingRes.error) throw holdingRes.error;

      const byVendor = new Map(vendors.map((v) => [v.id, { vendor: v.name, jobs_ytd: 0, spend_ytd_usd: 0, currently_holding: [] }]));
      for (const row of ytdRes.data ?? []) {
        const v = byVendor.get(row.vendor_id);
        if (!v) continue;
        v.jobs_ytd += 1;
        v.spend_ytd_usd += Number(row.cost) || 0;
      }
      for (const row of holdingRes.data ?? []) {
        const v = byVendor.get(row.vendor_id);
        if (v && row.unit?.number) v.currently_holding.push(row.unit.number);
      }
      const result = [...byVendor.values()].map((v) => ({ ...v, spend_ytd_usd: Math.round(v.spend_ytd_usd) }));
      return { vendors: result };
    }

    case "get_spend_summary": {
      let query = supabase.from("work_orders")
        .select("cost, category, unit:units(number)")
        .eq("status", "Closed").eq("voided", false);
      if (input.start_date) query = query.gte("date_closed", input.start_date);
      if (input.end_date) query = query.lte("date_closed", input.end_date);
      const { data, error } = await query;
      if (error) throw error;

      let total = 0;
      const byCategory = new Map();
      const byUnit = new Map();
      for (const row of data ?? []) {
        const cost = Number(row.cost) || 0;
        total += cost;
        byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + cost);
        const unitNumber = row.unit?.number ?? "Unassigned";
        byUnit.set(unitNumber, (byUnit.get(unitNumber) ?? 0) + cost);
      }
      const topUnits = [...byUnit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([unit, spend]) => ({ unit, spend_usd: Math.round(spend) }));
      const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
        .map(([category, spend]) => ({ category, spend_usd: Math.round(spend) }));

      return {
        total_spend_usd: Math.round(total),
        work_order_count: (data ?? []).length,
        by_category: categories,
        top_units_by_spend: topUnits,
      };
    }

    case "get_unit_status": {
      const { data: unit, error: unitErr } = await supabase
        .from("units").select("id, number, type, current_location, driver_name, can_move_load, is_active, odometer, last_pm_date")
        .ilike("number", input.unit_number).maybeSingle();
      if (unitErr) throw unitErr;
      if (!unit) return { found: false };

      const { data: orders, error: ordersErr } = await supabase
        .from("work_orders")
        .select("category, description, complaint, cost, status, date_opened, date_closed, vendor:vendors(name)")
        .eq("unit_id", unit.id).eq("voided", false)
        .order("date_opened", { ascending: false }).limit(8);
      if (ordersErr) throw ordersErr;

      return {
        found: true,
        unit: unit.number,
        type: unit.type,
        location: unit.current_location,
        driver: unit.driver_name,
        can_move_load: unit.can_move_load,
        is_active: unit.is_active,
        odometer: unit.odometer,
        last_pm_date: unit.last_pm_date,
        open_work_orders: (orders ?? []).filter((o) => o.status !== "Closed").map((o) => ({
          category: o.category, issue: o.complaint || o.description, status: o.status, vendor: o.vendor?.name ?? null, opened: o.date_opened,
        })),
        recent_closed: (orders ?? []).filter((o) => o.status === "Closed").slice(0, 5).map((o) => ({
          category: o.category, cost_usd: Math.round(Number(o.cost) || 0), vendor: o.vendor?.name ?? null, closed: o.date_closed,
        })),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages (a non-empty array of {role, content}) is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caller's own auth, so every tool query respects this user's RLS --
    // same pattern as alvys-miles/samsara-miles, not the service role.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const client = new Anthropic();
    const conversation: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    let finalText = "";
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1536,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        tool_choice: { type: "auto" },
        messages: conversation,
      });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (toolUses.length === 0) {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n\n");
        break;
      }

      conversation.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(toolUses.map(async (tu) => {
        try {
          const result = await runTool(supabase, tu.name, tu.input as Record<string, unknown>);
          return { type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(result) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify({ error: message }), is_error: true };
        }
      }));

      conversation.push({ role: "user", content: toolResults });

      if (turn === MAX_TOOL_TURNS - 1) {
        finalText = "That question needs more digging than I can do in one go -- try narrowing it (a specific unit, vendor, or date range).";
      }
    }

    return new Response(JSON.stringify({ answer: finalText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ops-copilot error:", err);
    const message = err instanceof Anthropic.APIError ? err.message : (err instanceof Error ? err.message : "Unexpected error");
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
