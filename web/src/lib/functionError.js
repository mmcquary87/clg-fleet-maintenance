import { FunctionsHttpError } from "@supabase/supabase-js";

// supabase-js's own error for a non-2xx Edge Function response never
// includes the function's own JSON body in .message -- it's always the
// generic "Edge Function returned a non-2xx status code", which is
// useless to a user or to us debugging a report. The actual reason (e.g.
// "ANTHROPIC_API_KEY" missing, a Claude API error, a validation message)
// is in error.context, the raw Response -- see the supabase-js docs'
// own "Error handling" example for functions.invoke().
export async function describeFunctionError(err) {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      if (body?.error) return body.error;
    } catch {
      // context wasn't JSON -- fall through to the generic message below.
    }
  }
  return err.message;
}
