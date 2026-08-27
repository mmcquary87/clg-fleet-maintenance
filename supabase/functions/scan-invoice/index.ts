// Fleet Maintenance System — invoice/receipt scanner
//
// Deno Edge Function. Receives a base64-encoded receipt image/PDF, sends it
// to the Claude API for structured extraction, and returns
// {vendor, category, cost, date, invoiceRef, description, unitNumberGuess}
// so the frontend can pre-fill the New Work Order form for the user to
// review before saving. Never returns anything that writes to the database
// directly — extraction only.
//
// Requires the ANTHROPIC_API_KEY secret (Edge Functions -> Secrets).
// Requires a valid Supabase auth JWT on every request (default verify_jwt
// behavior) — only logged-in CLG users can trigger a scan.

import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.69.0/helpers/zod";
import { z } from "npm:zod@3.24.1";

const CATEGORIES = [
  "PM / Oil", "Tires", "Brakes", "Engine", "Electrical",
  "Transmission", "Trailer / Body", "DOT Inspection", "Other",
] as const;

const InvoiceExtraction = z.object({
  vendor: z.string().describe("Vendor/shop name as printed on the invoice, including location if shown"),
  category: z.enum(CATEGORIES).describe("Best-fit maintenance category for the primary work described"),
  cost: z.number().describe("Total amount due/charged on the invoice, in dollars"),
  date: z.string().nullable().describe("Service or invoice date in YYYY-MM-DD format, or null if not legible"),
  invoiceRef: z.string().nullable().describe("Invoice number, PO number, or work order number printed on the document"),
  description: z.string().describe("One or two sentence summary of the work performed"),
  unitNumberGuess: z.string().nullable().describe("Truck/trailer unit number if visible on the document, else null"),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mediaType } = await req.json();
    if (!fileBase64 || !mediaType) {
      return new Response(JSON.stringify({ error: "fileBase64 and mediaType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic();

    const fileBlock = mediaType === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: mediaType, data: fileBase64 } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: fileBase64 } };

    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: {
        format: zodOutputFormat(InvoiceExtraction),
        effort: "low",
      },
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text: [
                "This is a truck/trailer maintenance invoice or receipt for a fleet company (CLG Transportation).",
                "Extract the structured fields. Fixed category list you must choose from:",
                CATEGORIES.join(", ") + ".",
                "If the invoice covers multiple line items across different categories, pick the category of the",
                "single largest line item as the primary category, and mention the others in the description.",
                "If a field truly isn't present on the document, use null rather than guessing a specific value —",
                "except category and description, which are always required.",
              ].join(" "),
            },
          ],
        },
      ],
    });

    if (!response.parsed_output) {
      return new Response(JSON.stringify({ error: "Could not extract structured data from this file." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(response.parsed_output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scan-invoice error:", err);
    const message = err instanceof Anthropic.APIError ? err.message : "Unexpected error scanning invoice";
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
